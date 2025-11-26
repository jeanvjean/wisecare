// @ts-nocheck
// Cancels the user's current active subscription in Chargebee
// POST /functions/v1/cancel-subscription
// Headers:
//   Authorization: Bearer <user_access_token>
//   apikey: <anon key>
// Body (optional):
// {
//   "subscription_id": "sub_xxx"  // optional, if not provided, finds current active
// }
//
// Response 200:
// {
//   "subscription": {
//     "id": "sub_xxx",
//     "status": "cancelled"
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
    const cancellationReason = body?.cancellation_reason?.trim()

    // If no subId provided, find current active subscription
    if (!subId) {
      const listUrl = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions?customer_id[is]=${encodeURIComponent(userId)}&status[is]=active&limit=1`
      const listRes = await fetch(listUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
          'Accept': 'application/json'
        }
      })
      if (!listRes.ok) {
        const text = await listRes.text()
        return new Response(JSON.stringify({
          error: 'Failed to find active subscription',
          upstream_status: listRes.status,
          upstream_body: tryParse(text)
        }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        })
      }
      const listPayload = await listRes.json()
      const first = (listPayload.list || [])[0]
      if (!first || !first.subscription) {
        return new Response(JSON.stringify({ error: 'No active subscription found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        })
      }
      subId = first.subscription.id
    }

    // Attempt cancellation with Product Catalog 2.0 first, then fall back if Chargebee complains
    const cancelBodyJSON = {
      end_of_term: true,               // PC2 style
      cancel_option: 'end_of_term'     // fallback param some APIs still accept
    }

    // Try 1: PC2 endpoint: cancel_for_items (JSON)
    const pc2Url = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions/${encodeURIComponent(subId)}/cancel_for_items`
    let cancelRes = await fetch(pc2Url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Chargebee-Version': '2022-10-10'
      },
      body: JSON.stringify(cancelBodyJSON)
    })

    // If PC2 endpoint complains about PC1/PC2 mismatch or returns a 4xx, try the classic cancel endpoint with JSON
    if (!cancelRes.ok) {
      const txt = await cancelRes.text().catch(() => '')
      const bodyParsed = tryParse(txt)
      const errMsg = typeof bodyParsed === 'string' ? bodyParsed : (bodyParsed?.error_msg || bodyParsed?.message || '')
      const errCode = typeof bodyParsed === 'object' ? (bodyParsed?.error_code || bodyParsed?.api_error_code) : null

      const looksLikePCMismatch =
        cancelRes.status >= 400 && cancelRes.status < 500 &&
        (
          (typeof errMsg === 'string' && /product catalog/i.test(errMsg)) ||
          (typeof errCode === 'string' && /pc2_to_pc1_error|pc1_to_pc2_error/i.test(errCode))
        )

      if (looksLikePCMismatch || cancelRes.status === 400 || cancelRes.status === 404 || cancelRes.status === 422) {
        // Try 2: classic cancel endpoint (still valid for many PC2 setups) using JSON
        const pcClassicUrl = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions/${encodeURIComponent(subId)}/cancel`
        const cancelRes2 = await fetch(pcClassicUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Chargebee-Version': '2022-10-10'
          },
          body: JSON.stringify(cancelBodyJSON)
        })

        if (!cancelRes2.ok) {
          const txt2 = await cancelRes2.text().catch(() => '')
          const bodyParsed2 = tryParse(txt2)

          // Try 3 (last resort): classic cancel endpoint with form-encoded body (older semantics)
          const formParams = new URLSearchParams()
          formParams.set('cancel_option', 'end_of_term')

          const cancelRes3 = await fetch(pcClassicUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
              'Accept': 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
              'Chargebee-Version': '2022-10-10'
            },
            body: formParams
          })

          // If third attempt also fails, keep the most PC2-appropriate error (first attempt) for diagnostics
          if (cancelRes3.ok) {
            cancelRes = cancelRes3
          } else {
            // Prefer the more descriptive error between attempts
            cancelRes = cancelRes2.status >= cancelRes.status ? cancelRes2 : cancelRes
          }
        } else {
          cancelRes = cancelRes2
        }
      }
    }

    console.log('Chargebee cancel response ←', cancelRes.status)

    if (!cancelRes.ok) {
      const text = await cancelRes.text()
      const errorBody = tryParse(text)
      
      // Log the specific error for debugging
      console.error('Chargebee cancellation error:', errorBody)
      
      return new Response(JSON.stringify({
        error: 'Cancellation failed',
        upstream_status: cancelRes.status,
        upstream_body: errorBody
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    const cancelPayload = await cancelRes.json()
    const cancelledSub = cancelPayload.subscription

    // Update local DB to reflect Chargebee status
    const newLocalStatus = cancelledSub?.status || 'non_renewing'

    let newPeriodEnd: string | null = null
    const termEnd = cancelledSub?.current_term_end
    if (typeof termEnd === 'number') {
      newPeriodEnd = new Date(termEnd * 1000).toISOString()
    }

    const updatePayload: Record<string, any> = { status: newLocalStatus }
    if (newPeriodEnd) {
      updatePayload.current_period_end = newPeriodEnd
    }
    if (cancellationReason) {
      updatePayload.cancellation_reason = cancellationReason
    }

    const { error: dbErr } = await admin
      .from('subscriptions')
      .update(updatePayload)
      .eq('chargebee_subscription_id', subId)

    if (dbErr) {
      console.error('DB update error:', dbErr)
    }

    // Send email notification to the user about subscription cancellation
    try {
      // Get user profile for email template
      const { data: userProfile, error: profileErr } = await admin
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', userId)
        .single()

      const userFirstName = userProfile?.first_name || 'there'

      const emailSubject = 'Subscription Cancelled - WiseCare'
      const emailText = `Hi ${userFirstName},

We've processed your cancellation request for your WiseCare plan.
Coverage for your beneficiary will continue until the end of the paid period.

You can always return to WiseCare whenever you're ready — your loved ones' health deserves it.

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
        <p style="font-size: 16px; color: #000000; font-weight: 400; line-height: 40px;">
          We've processed your cancellation request for your WiseCare plan.
          <br />
          Coverage for your beneficiary will continue until <br />
          the end of the paid period.
        </p>

        <p style="font-size: 16px; color: #000000; font-weight: 400; line-height: 40px; margin-top: 60px; margin-bottom: 60px;">
          You can always return to WiseCare whenever you're ready — your <br />
          loved ones' health deserves it.
        </p>
        <a href="${origin}/plans" style="text-decoration: none;">
          <button style="width: 237px; height: 49px; background-color: #7dff68; border: none; border-radius: 12px; font-size: 20px; font-weight: 900; color: #060606; cursor: pointer;">
           Re-activate My Plan
          </button>
        </a>

        <div style="background-color: #000000; padding: 49px 38px; margin-top: 91px; text-align: center; color: white; font-size: 13px; height: 270px; display: flex;">
          <div style="width: 650px; margin: auto">
            <p>Care for your loved ones, from anywhere in the world.</p>
            <p>
              <a href="http://" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: white">🌍Visit Website</a> |
              <a href="http://" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: white">✉️ Get Support</a>
            </p>
            <p style="margin-top: 15px; margin-bottom: 15px">
              You're receiving this email because you have a WiseCare account or were added as a beneficiary.If you'd prefer not to receive these notifications, you can [unsubscribe here].
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
      console.log('Subscription cancellation email sent via Postmark SMTP to user:', userData.user.email)
    } catch (emailErr) {
      // Log email errors but don't fail the cancellation
      console.error('Failed to send subscription cancellation email:', emailErr)
    }

    return new Response(JSON.stringify({
      subscription: cancelledSub,
      message: 'Subscription cancelled successfully'
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

function tryParse(text: string) {
  try { return JSON.parse(text) } catch { return text }
}