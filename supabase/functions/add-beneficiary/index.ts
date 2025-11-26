// @ts-nocheck
// Edge function: add-beneficiary
// POST: Insert a dependent for the authenticated user and send email (Postmark) if email provided

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
    const {
      first_name,
      last_name,
      relationship,
      phone_number,
      email,
      date_of_birth,
      subscription_id
    } = body

    if (!relationship || !date_of_birth) {
      return new Response(JSON.stringify({ error: 'Missing required fields: relationship and date_of_birth' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Check for duplicate email if email is provided
    if (email) {
      const { data: existingDependents, error: checkErr } = await supabase
        .from('dependents')
        .select('id')
        .eq('email', email)
        .eq('user_id', user.id)

      if (checkErr) {
        console.error('Error checking for duplicate email:', checkErr)
        return new Response(JSON.stringify({ error: 'Failed to validate email uniqueness' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        })
      }

      if (existingDependents && existingDependents.length > 0) {
        return new Response(JSON.stringify({ error: 'You already have a dependent with this email address' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        })
      }
    }

    const payload: any = {
      user_id: user.id,
      first_name: first_name || null,
      last_name: last_name || null,
      relationship,
      phone_number: phone_number || null,
      email: email || null,
      date_of_birth: new Date(date_of_birth).toISOString(),
      subscription_id: subscription_id || null,
      status: 'inactive'
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('dependents')
      .insert(payload)
      .select('*')
      .single()

    if (insertErr) {
      console.error('Failed to insert dependent:', insertErr)
      return new Response(JSON.stringify({ error: 'Failed to add dependent' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Attempt to send email using the same setup as signup function if an email was provided.
    if (email) {
      try {
        // Get user profile information for the email template
        const { data: userProfile, error: profileErr } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', user.id)
          .single()

        const userFirstName = userProfile?.first_name || 'A user'
        const userLastName = userProfile?.last_name || ''
        const beneficiaryFirstName = first_name || 'there'

        const emailSubject = 'You have been added as a beneficiary - WiseCare'
        const emailText = `Hi ${beneficiaryFirstName},

Good news!

${userFirstName} ${userLastName} has added you as a beneficiary on WiseCare.

This means you now have access to healthcare coverage through our trusted local partners. Welcome to a smarter way to care.

Our customer success team will be in touch with you shortly with details on how to use your plan.

Welcome to WiseCare!`

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
         Good news!
        </p>
        <p style="font-size: 16px; color: #000000; font-weight: 400; line-height: 40px;">
          ${userFirstName} ${userLastName} has added you <br> as a beneficiary on WiseCare.
        </p>
            <p style="font-size: 16px; color: #000000; font-weight: 400; line-height: 40px; margin-top: 60px; margin-bottom: 60px;">
         This means you now have access to healthcare coverage through our <br> trusted local partners. Welcome to a smarter way to care.
        </p>
        </p>
            <p style="font-size: 16px; color: #000000; font-weight: 400; line-height: 40px;">
         Our customer success team will be in touch with you shortly with <br> details on how to use your plan.
        </p>
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
                        <img src="https://zksgxfqfmtiitjypxaoi.supabase.co/storage/v1/object/public/uploads/user-f03b5240-2e87-4d75-abe7-4e1cb63a1bb8/1759160188984-Instagram.png" width="24" height="24" style="display:block; object-fit:contain;">
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
          to: email,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        })
        console.log('Beneficiary added email sent via Postmark SMTP to:', email)
      } catch (e) {
        // Log and continue — insertion succeeded, email failure shouldn't block operation
        console.error('Failed to send beneficiary-added email:', e)
      }
    }

    return new Response(JSON.stringify({ dependent: inserted }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  } catch (e) {
    console.error('Unhandled error in add-beneficiary:', e)
    return new Response(JSON.stringify({ error: 'Internal server error', details: String((e && e.message) || e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})