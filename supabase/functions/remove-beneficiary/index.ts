// @ts-nocheck
// Edge function: remove-beneficiary
// POST: Remove a dependent from the authenticated user's list and send email if email provided

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendMail } from '../_lib/email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, authorization, x-client-info, apikey, content-type'
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token)

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    const body = await req.json().catch(() => ({}))
    const { id } = body

    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing required field: id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // First, get the beneficiary details to check ownership and get email for notification
    const { data: beneficiary, error: fetchErr } = await supabase
      .from('dependents')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchErr || !beneficiary) {
      return new Response(JSON.stringify({ error: 'Beneficiary not found or access denied' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Allow removal even with active subscription for now
    // Previous logic checked: if (subscription?.status === 'active' && subscription?.current_period_end) {
    //   const end = new Date(subscription.current_period_end)
    //   if (end.getTime() > Date.now()) {
    //     return error response
    //   }
    // }

    // Remove the beneficiary
    const { error: deleteErr } = await supabase
      .from('dependents')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteErr) {
      console.error('Failed to remove dependent:', deleteErr)
      return new Response(JSON.stringify({ error: 'Failed to remove dependent' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Attempt to send email using the same setup as signup function if an email was provided.
    if (beneficiary.email) {
      try {
        // Get user profile information for the email template
        const { data: userProfile, error: profileErr } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', user.id)
          .single()

        const userFirstName = userProfile?.first_name || 'A user'
        const userLastName = userProfile?.last_name || ''
        const beneficiaryFirstName = beneficiary.first_name || 'there'

        const emailSubject = 'Beneficiary Removed - WiseCare'
        const emailText = `Hi ${beneficiaryFirstName},

This is to inform you that ${userFirstName} ${userLastName} has removed you as a beneficiary from their WiseCare account.

If you have any questions, please contact support.

Best regards,
WiseCare Team`

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
          Hi ${beneficiaryFirstName},
        </h6>
        <p style="font-size: 16px; color: #000000; font-weight: 400">
         Update on your beneficiary status
        </p>
        <p style="font-size: 16px; color: #000000; font-weight: 400; line-height: 40px;">
          ${userFirstName} ${userLastName} has removed you <br> as a beneficiary from their WiseCare account.
        </p>
            <p style="font-size: 16px; color: #000000; font-weight: 400; line-height: 40px; margin-top: 60px; margin-bottom: 60px;">
         If you have any questions about this change, please contact our support team.
        </p>

        <div style="background-color: #000000; padding: 49px 38px; margin-top: 91px; text-align: center; color: white; font-size: 13px; height: 270px; display: flex;">
            <div style="width: 650px; margin: auto;">

            <p>Care for your loved ones, from anywhere in the world.</p>
            <p >
                <a href="http://" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: white;">🌍Visit Website</a>      |
                <a href="http://" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: white;">✉️ Get Support</a>  </p>
                <p style="margin-top: 15px; margin-bottom: 15px;">You're receiving this email because you have a WiseCare account or were added as a beneficiary.If you'd prefer not to receive these notifications, you can [unsubscribe here].</p>
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
          to: beneficiary.email,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        })
        console.log('Beneficiary removed email sent via Postmark SMTP to:', beneficiary.email)
      } catch (e) {
        // Log and continue — removal succeeded, email failure shouldn't block operation
        console.error('Failed to send beneficiary-removed email:', e)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  } catch (e) {
    console.error('Unhandled error in remove-beneficiary:', e)
    return new Response(JSON.stringify({ error: 'Internal server error', details: String((e && e.message) || e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})