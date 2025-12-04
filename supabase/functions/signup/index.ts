// @ts-nocheck
// User signup via edge function
// POST /functions/v1/signup
// Body: { "email": "user@example.com", "password": "password", "firstName": "John", "lastName": "Doe", "country": "UK", "phoneNumber": "+1234567890", "deliveryMethod": "sms" }
// Response: { "message": "User created, OTP sent", "otp_id": "..." }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendMail } from '../_lib/email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  }
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
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
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const body = await req.json()
    const { email, password, firstName, lastName, country, phoneNumber, deliveryMethod } = body
    let { resendOnly } = body

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    if (!resendOnly && (!firstName || !lastName || !country)) {
      return new Response(JSON.stringify({ error: 'All fields are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Validate password strength if not resendOnly and password is provided
    if (!resendOnly && password) {
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&.]{8,}$/
      if (!passwordRegex.test(password)) {
        return new Response(JSON.stringify({
          error: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        })
      }
    }

    // Check if user already exists
    const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers()
    if (listError) throw listError

    const existingUser = existingUsers.users.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (existingUser && !resendOnly) {
      if (!existingUser.email_confirmed_at) {
        // User exists but email is not confirmed, resend OTP
        resendOnly = true
      } else {
        return new Response(JSON.stringify({ error: 'User already exists' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        })
      }
    }

    if (!existingUser && resendOnly) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    let user = existingUser

    if (!resendOnly) {
      // Use dummy password if not provided
      const userPassword = password || 'TempPassword123!'

      // Create user
      const { data: newUser, error: createError } = await admin.auth.admin.createUser({
        email,
        password: userPassword,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          country,
          ...(phoneNumber && { phone_number: phoneNumber }),
          ...(deliveryMethod && { delivery_method_preference: deliveryMethod })
        },
        email_confirm: false // We'll send our own OTP
      })

      if (createError) throw createError
      user = newUser

      // Insert into profiles table to generate unique_id
      const { data: profileData, error: profileError } = await admin
        .from('profiles')
        .insert({
          id: user.user.id,
          first_name: firstName,
          last_name: lastName,
          country: country,
          ...(phoneNumber && { phone_number: phoneNumber }),
          ...(deliveryMethod && { delivery_method_preference: deliveryMethod })
        })
        .select('unique_id')
        .single();

      if (profileError) throw profileError;

      // Update auth.users metadata with the generated unique_id
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(user.user.id, {
        user_metadata: {
          ...user.user.user_metadata,
          unique_id: profileData.unique_id,
        },
      });

      if (updateAuthError) throw updateAuthError;
    }

    // Generate OTP and store it temporarily
    const otp = generateOTP()
    const otpId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Store OTP in user metadata
    const userId = resendOnly ? user.id : user.user.id
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...(resendOnly ? user.user_metadata : user.user.user_metadata),
        signup_otp: otp,
        signup_otp_expires: expiresAt.toISOString(),
        signup_otp_id: otpId
      }
    })

    if (updateError) throw updateError

    // Send email with OTP using Supabase Resend (Postmark SMTP)
    const origin = req.headers.get('origin') || 'http://localhost:5173'
    const verifyUrl = `${origin}/verify-otp?email=${encodeURIComponent(email)}&otp_id=${otpId}`

    const emailSubject = 'Verify Your Email - WiseCare'
    const emailText = `Your verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nVerify your email here: ${verifyUrl}\n\nWelcome to WiseCare!`
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
                      Welcome to WiseCare!
                      </h6>
                      <p style="font-size: 16px; color: #000000; font-weight: 400">
                      Here's your one-time verification code:
                      </p>
                      <p style="color: #7d42fb; font-size: 24px; font-weight: 900">
                      ${otp}
                      </p>

                      <p style="font-size: 16px; color: #000000; font-weight: 400; line-height: 40px;">
                      It's valid for the next 5 minutes.
                      </p>
                      </p>
                          <p style="font-size: 16px; color: #000000; font-weight: 400; line-height: 40px;">
                      Enter it in the app to complete your sign-up.
                      </p>
                      </p>
                          <p style="font-size: 16px; color: #000000; font-weight: 400; line-height: 40px;">
                      Caring for your loved ones starts here. 💙
                      </p>

                      <div style="background-color: #000000; padding: 49px 38px; margin-top: 91px; text-align: center; color: white; font-size: 13px; height: 270px; display: flex;">
                          <div style="width: 650px; margin: auto;">

                          <p>Care for your loved ones, from anywhere in the world.</p>
                          <p>
                              <a href="http://" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: white;">🌍Visit Website</a>
                              <a href="http://" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: white;">✉️ Get Support</a>
                              </p>
                              <p style="margin-top: 15px; margin-bottom: 15px;">You're receiving this email because you have a WiseCare account or were added as a beneficiary.If you'd prefer not to receive these notifications, you can [unsubscribe here].</p>
                              <p>Registered in England & Wales | Company No. 16613659</p>
                              <table align="center" cellpadding="0" cellspacing="0" role="presentation" style="margin:auto; margin-top:22px;">
                                <tr>
                                  <td align="center" style="padding: 0 20px;">
                                    <a href="http://" target="_blank" rel="noopener noreferrer" style="display:inline-block;">
                                      <img src="https://api.wisecare.co/storage/v1/object/public/uploads/001-facebook.png" alt="" width="24" height="24" style="display:block; object-fit:contain;">
                                    </a>
                                  </td>
                                  <td align="center" style="padding: 0 20px;">
                                    <a href="http://" target="_blank" rel="noopener noreferrer" style="display:inline-block;">
                                      <img src="https://api.wisecare.co/storage/v1/object/public/uploads/003-twitter.png" alt="" width="24" height="24" style="display:block; object-fit:contain;">
                                    </a>
                                  </td>
                                  <td align="center" style="padding: 0 20px;">
                                    <a href="http://" target="_blank" rel="noopener noreferrer" style="display:inline-block;">
                                      <img src="https://api.wisecare.co/storage/v1/object/public/uploads/Instagram.png" alt="" width="24" height="24" style="display:block; object-fit:contain;">
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

    try {
      const mailResult = await sendMail({
        to: email,
        subject: emailSubject,
        text: emailText,
        html: emailHtml,
        type: 'welcome'
      })

      if (mailResult.rejected.length > 0) {
        console.error('Failed to send signup OTP email to:', mailResult.rejected)
        return new Response(JSON.stringify({ error: 'Failed to send signup OTP email' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        })
      }

      console.log('Signup OTP email sent via Supabase Resend to:', email)
    } catch (emailError) {
      // Log the error but don't fail the request
      console.error('Failed to send signup OTP email via Supabase Resend:', emailError)
    }

    return new Response(JSON.stringify({
      message: resendOnly ? 'OTP sent to email' : 'User created, OTP sent to email',
      otp_id: otpId,
      ...(phoneNumber && { phoneNumber: phoneNumber }),
      ...(deliveryMethod && { deliveryMethod: deliveryMethod })
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })

  } catch (e) {
    console.error('signup error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: 'Internal error', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})