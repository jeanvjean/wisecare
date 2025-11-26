// @ts-nocheck
// Reactivates a cancelled/non-renewing subscription in Chargebee
// POST /functions/v1/reactivate-subscription
// Headers:
//   Authorization: Bearer <user_access_token>
//   apikey: <anon key>
// Body (optional):
// {
//   "subscription_id": "sub_xxx"  // optional, finds cancelled subscription if not provided
// }
//
// Response 200:
// {
//   "subscription": {
//     "id": "sub_xxx",
//     "status": "active"
//   }
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendMail } from '../_lib/email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CHARGEBEE_SITE = Deno.env.get('CHARGEBEE_SITE') || 'enyata-test'
const CHARGEBEE_API_KEY = Deno.env.get('CHARGEBEE_API_KEY') || 'test_WDOffoOLVp4VmsweeaBcdSlcureDbvGoAF'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  }
}

function tryParse(text: string) {
  try { return JSON.parse(text) } catch { return text }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing Authorization bearer token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token', details: userErr?.message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }
    const userId = userData.user.id as string

    let body = {}
    try {
      body = await req.json()
    } catch {
      // Ignore if body is empty
    }
    let subId = body?.subscription_id?.trim()

    // If no subId provided, find cancelled/non-renewing subscription
    if (!subId) {
      // Try cancelled first
      let listUrl = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions?customer_id[is]=${encodeURIComponent(userId)}&status[is]=cancelled&limit=1`
      let listRes = await fetch(listUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
          'Accept': 'application/json'
        }
      })

      let listPayload = await listRes.json()
      let first = (listPayload.list || [])[0]

      // If no cancelled subscription found, try non_renewing
      if (!first || !first.subscription) {
        listUrl = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions?customer_id[is]=${encodeURIComponent(userId)}&status[is]=non_renewing&limit=1`
        listRes = await fetch(listUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
            'Accept': 'application/json'
          }
        })

        if (!listRes.ok) {
          const text = await listRes.text()
          return new Response(JSON.stringify({
            error: 'Failed to find cancelled subscription',
            upstream_status: listRes.status,
            upstream_body: tryParse(text)
          }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', ...corsHeaders() }
          })
        }

        listPayload = await listRes.json()
        first = (listPayload.list || [])[0]
      }

      if (!first || !first.subscription) {
        return new Response(JSON.stringify({ error: 'No cancelled subscription found to reactivate' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        })
      }
      subId = first.subscription.id
    }

    console.log('Reactivating subscription:', subId)

    // Attempt reactivation with Chargebee
    const reactivateUrl = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions/${encodeURIComponent(subId)}/reactivate`
    const reactivateRes = await fetch(reactivateUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })

    console.log('Chargebee reactivate response ←', reactivateRes.status)

    if (!reactivateRes.ok) {
      const text = await reactivateRes.text()
      const errorBody = tryParse(text)

      console.error('Chargebee reactivation error:', errorBody)

      return new Response(JSON.stringify({
        error: 'Reactivation failed',
        upstream_status: reactivateRes.status,
        upstream_body: errorBody
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    const reactivatePayload = await reactivateRes.json()
    const reactivatedSub = reactivatePayload.subscription

    // Update local DB to reflect Chargebee status
    const newLocalStatus = reactivatedSub?.status || 'active'

    let newPeriodEnd: string | null = null
    const termEnd = reactivatedSub?.current_term_end
    if (typeof termEnd === 'number') {
      newPeriodEnd = new Date(termEnd * 1000).toISOString()
    }

    const updatePayload: Record<string, any> = { status: newLocalStatus }
    if (newPeriodEnd) {
      updatePayload.current_period_end = newPeriodEnd
    }
    // Clear cancellation reason on reactivation
    updatePayload.cancellation_reason = null

    const { error: dbErr } = await admin
      .from('subscriptions')
      .update(updatePayload)
      .eq('chargebee_subscription_id', subId)

    if (dbErr) {
      console.error('DB update error:', dbErr)
    }

    // Send email notification to the user about subscription reactivation
    try {
      // Get user profile for email template
      const { data: userProfile, error: profileErr } = await admin
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', userId)
        .single()

      const userFirstName = userProfile?.first_name || 'there'

      const emailSubject = 'Plan Reactivated - WiseCare'
      const emailText = `Hi ${userFirstName},

Your plan has successfully renewed — uninterrupted healthcare coverage for your loved one continues.

You can always view payment history and plan details in your WiseCare account.

Thank you for staying with us. Peace of mind, guaranteed.

Best regards,
WiseCare Team`

      const origin = req.headers.get('origin') || 'http://localhost:5173'
      const emailHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link
      href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@100;200;300;400;500;600;700;800;900&display=swap"
      rel="stylesheet"
    />

    <title>WiseCare</title>
    <style>
      body {
        font-family: "work sans", sans-serif;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <div style="text-align: center; margin-top: 24px">
      <div>
        <img src="https://yzeydhelqlsurdbooacd.supabase.co/storage/v1/object/public/wisecare-files/logo-wisecare.png" 
             alt="WiseCare Logo" 
             style="width: 180px; height: auto; max-width: 100%; display: block; margin: 0 auto;" />
          Hi ${userFirstName},
        </h6>
        <p
          style="
            font-size: 16px;
            color: #000000;
            font-weight: 400;
            line-height: 40px;
          "
        >
          Your plan has successfully renewed — uninterrupted healthcare <br />
          coverage for your loved one continues.
        </p>

        <p
          style="
            font-size: 16px;
            color: #000000;
            font-weight: 400;
            line-height: 40px;
            margin-top: 60px;
            margin-bottom: 60px;
          "
        >
          You can always view payment history and plan details in your <br />
          WiseCare account.
        </p>
        <p
          style="
            font-size: 16px;
            color: #000000;
            font-weight: 400;
            line-height: 40px;
            margin-top: 60px;
            margin-bottom: 40px;
          "
        >
          Thank you for staying with us. Peace of mind, guaranteed.
        </p>
        <button
          style="
            width: 237px;
            height: 49px;
            background-color: #7dff68;
            border: none;
            border-radius: 12px;
            font-size: 20px;
            font-weight: 900;
            color: #060606;
          "
        >
          View My Plan
        </button>

        <div
          style="
            background-color: #000000;
            padding: 49px 38px;
            margin-top: 91px;
            text-align: center;
            color: white;
            font-size: 13px;
            height: 270px;
            display: flex;
          "
        >
          <div style="width: 650px; margin: auto">
            <p>Care for your loved ones, from anywhere in the world.</p>
            <p>
              <a
                href="https://wisecare.co"
                target="_blank"
                rel="noopener noreferrer"
                style="text-decoration: none; color: white"
                >🌍Visit Website</a
              >
              |
              <a
                href="mailto:support@wisecare.co"
                target="_blank"
                rel="noopener noreferrer"
                style="text-decoration: none; color: white"
                >✉️ Get Support</a
              >
            </p>
            <p style="margin-top: 15px; margin-bottom: 15px">
              You’re receiving this email because you have a WiseCare account or
              were added as a beneficiary.If you’d prefer not to receive these
              notifications, you can <a href="https://wisecare.co/unsubscribe" style="color: white; text-decoration: underline;">unsubscribe here</a>.
            </p>
            <p>Registered in England & Wales | Company No. 16613659</p>
            <table align="center" cellpadding="0" cellspacing="0" role="presentation" style="margin:auto; margin-top:22px;">
                <tr>
                  <td align="center" style="padding: 0 20px;">
                    <a href="https://facebook.com/wisecare" target="_blank" rel="noopener noreferrer" style="display:inline-block;">
                      <img src="https://zksgxfqfmtiitjypxaoi.supabase.co/storage/v1/object/public/uploads/user-f03b5240-2e87-4d75-abe7-4e1cb63a1bb8/1759160285952-001-facebook.png" alt="Facebook" width="24" height="24" style="display:block; object-fit:contain;">
                    </a>
                  </td>
                  <td align="center" style="padding: 0 20px;">
                    <a href="https://twitter.com/wisecare" target="_blank" rel="noopener noreferrer" style="display:inline-block;">
                      <img src="https://zksgxfqfmtiitjypxaoi.supabase.co/storage/v1/object/public/uploads/user-f03b5240-2e87-4d75-abe7-4e1cb63a1bb8/1759160243681-003-twitter.png" alt="Twitter" width="24" height="24" style="display:block; object-fit:contain;">
                    </a>
                  </td>
                  <td align="center" style="padding: 0 20px;">
                    <a href="https://instagram.com/wisecare" target="_blank" rel="noopener noreferrer" style="display:inline-block;">
                      <img src="https://zksgxfqfmtiitjypxaoi.supabase.co/storage/v1/object/public/uploads/user-f03b5240-2e87-4d75-abe7-4e1cb63a1bb8/1759160188984-Instagram.png" alt="Instagram" width="24" height="24" style="display:block; object-fit:contain;">
                    </a>
                  </td>
                </tr>
              </table>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;

      await sendMail({
        to: userData.user.email!,
        subject: emailSubject,
        text: emailText,
        html: emailHtml
      })
      console.log('Subscription reactivation email sent via Postmark SMTP to user:', userData.user.email)
    } catch (emailErr) {
      // Log email errors but don't fail the reactivation
      console.error('Failed to send subscription reactivation email:', emailErr)
    }

    return new Response(JSON.stringify({
      subscription: reactivatedSub,
      message: 'Subscription reactivated successfully'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: 'Internal error', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})