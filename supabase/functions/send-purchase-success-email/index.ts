// @ts-nocheck
// Edge function: send-purchase-success-email
// POST /functions/v1/send-purchase-success-email
// Headers:
//   Authorization: Bearer <user_access_token>
//   apikey: <anon key>
// Body:
// {
//   "subscription_id": "sub_xxx"  // required
// }
//
// Response 200:
// {
//   "message": "Purchase success email sent successfully"
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendMail } from '../_lib/email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
    const subscriptionId = body?.subscription_id?.trim()
    if (!subscriptionId) {
      return new Response(JSON.stringify({ error: 'subscription_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Verify the subscription belongs to the user
    const { data: subscription, error: subErr } = await admin
      .from('subscriptions')
      .select('*')
      .eq('chargebee_subscription_id', subscriptionId)
      .eq('user_id', userId)
      .single()

    if (subErr || !subscription) {
      return new Response(JSON.stringify({ error: 'Subscription not found or access denied' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Get user profile for email template
    const { data: userProfile, error: profileErr } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', userId)
      .single()

    const userFirstName = userProfile?.first_name || 'there'

    const emailSubject = 'Welcome to WiseCare - Your Plan is Live!'
    const emailText = `Congratulations ${userFirstName}!

Your WiseCare plan is live — your loved one now has access to trusted healthcare locally.

What's Next?
You can view and manage the plan anytime in your WiseCare account.
Your beneficiary will also receive a welcome notification with their coverage details.

Thank you for choosing WiseCare!

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
        <img src="https://api.wisecare.co/storage/v1/object/public/uploads/Logo.png"
                    alt="WiseCare Logo"
                    style="width: 180px; height: auto; max-width: 100%; display: block; margin: 0 auto;" />
          Congratulations, ${userFirstName}!
        </h6>
        <p style="font-size: 16px; color: #000000; font-weight: 400">
          Your WiseCare plan is live —
        </p>
        <p style="font-size: 16px; color: #000000; font-weight: 400">
          your loved one now has access to trusted healthcare locally.
        </p>
        <p style="color: #7d42fb; font-size: 24px; font-weight: 900; margin-top: 60px;">
          What's Next?
        </p>
            <p style="font-size: 16px; color: #000000; font-weight: 400; line-height: 40px;">
         You can view and manage the plan anytime in your WiseCare account.
        </p>
        </p>
            <p style="font-size: 16px; color: #000000; font-weight: 400; line-height: 40px;">
         Your beneficiary will also receive a welcome notification with <br> their coverage details.
        </p>
        </p>
            <p style="font-size: 16px; color: #000000; font-weight: 400; line-height: 40px; margin-top: 60px; margin-bottom: 60px;">
          Thank you for choosing WiseCare 💙
        </p>

        <div style="background-color: #000000; padding: 49px 38px; margin-top: 91px; text-align: center; color: white; font-size: 13px; height: 270px; display: flex;">
            <div style="width: 650px; margin: auto;">

            <p>Care for your loved ones, from anywhere in the world.</p>
            <p >
                <a href="https://wisecare.co" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: white;">🌍Visit Website</a>      |
                <a href="mailto:support@wisecare.co" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: white;">✉️ Get Support</a>  </p>
                <p style="margin-top: 15px; margin-bottom: 15px;">You're receiving this email because you have a WiseCare account or were added as a beneficiary.If you'd prefer not to receive these notifications, you can <a href="https://wisecare.co/unsubscribe" style="color: white; text-decoration: underline;">unsubscribe here</a>.</p>
                <p>Registered in England & Wales | Company No. 16613659</p>
                <table align="center" cellpadding="0" cellspacing="0" role="presentation" style="margin:auto; margin-top:22px;">
                  <tr>
                    <td align="center" style="padding: 0 20px;">
                      <a href="https://facebook.com/wisecare" target="_blank" rel="noopener noreferrer" style="display:inline-block;">
                        <img src="https://api.wisecare.co/storage/v1/object/public/uploads/001-facebook.png" alt="Facebook" width="24" height="24" style="display:block; object-fit:contain;">
                      </a>
                    </td>
                    <td align="center" style="padding: 0 20px;">
                      <a href="https://twitter.com/wisecare" target="_blank" rel="noopener noreferrer" style="display:inline-block;">
                        <img src="https://api.wisecare.co/storage/v1/object/public/uploads/003-twitter.png" alt="Twitter" width="24" height="24" style="display:block; object-fit:contain;">
                      </a>
                    </td>
                    <td align="center" style="padding: 0 20px;">
                      <a href="https://instagram.com/wisecare" target="_blank" rel="noopener noreferrer" style="display:inline-block;">
                        <img src="https://api.wisecare.co/storage/v1/object/public/uploads/Instagram.png" alt="Instagram" width="24" height="24" style="display:block; object-fit:contain;">
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

    console.log('Purchase success email sent via Postmark SMTP to user:', userData.user.email)

    return new Response(JSON.stringify({
      message: 'Purchase success email sent successfully'
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