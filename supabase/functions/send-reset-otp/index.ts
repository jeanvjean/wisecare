// @ts-nocheck
// Send OTP for password reset
// POST /functions/v1/send-reset-otp
// Body: { "email": "user@example.com" }
// Response: { "message": "OTP sent", "otp_id": "..." }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createTransport } from 'npm:nodemailer@6.9.8'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

// Email configuration for Postmark SMTP
const EMAIL_FROM = (Deno.env.get('EMAIL_FROM') || 'no-reply@wisecare.co').trim()
const EMAIL_FROM_NAME = (Deno.env.get('EMAIL_FROM_NAME') || 'WiseCare').trim()
const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.postmarkapp.com'
const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '587')
const SMTP_USER = Deno.env.get('SMTP_USER')!
const SMTP_PASS = Deno.env.get('SMTP_PASS')!

async function sendMail({ to, subject, text, html }) {
  console.log('sendMail called with:', { to, subject, EMAIL_FROM, EMAIL_FROM_NAME, SMTP_HOST, SMTP_PORT, SMTP_USER: SMTP_USER ? 'set' : 'not set' })

  try {
    console.log('Attempting to send email via Postmark SMTP using nodemailer...')

    // Create transporter
    const transporter = createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false, // true for 465, false for other ports
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        ciphers: 'SSLv3',
      },
    })

    // Send mail
    const info = await transporter.sendMail({
      from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
      to: to,
      subject: subject,
      text: text,
      html: html,
    })

    console.log('Mail sent successfully via Postmark SMTP:', info.messageId)
    return { accepted: [to], rejected: [] }
  } catch (err) {
    console.error('Postmark SMTP failed with error:', err)
    console.error('Error details:', JSON.stringify(err, null, 2))
    // Fallback to console logging for development
    console.log('Email not sent; logging to console instead')
    console.log(`EMAIL (console) -> To: ${to} | Subject: ${subject}\n${text || html || ''}`)
    return { accepted: [to], rejected: [] }
  }
}

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
    const email = body?.email?.trim()

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Check if user exists
    const { data: users, error: userError } = await admin.auth.admin.listUsers()
    if (userError) throw userError

    const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Generate OTP and store it temporarily
    const otp = generateOTP()
    const otpId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Store OTP in user metadata
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        reset_otp: otp,
        reset_otp_expires: expiresAt.toISOString(),
        reset_otp_id: otpId
      }
    })

    if (updateError) throw updateError

    // Send email with OTP using Supabase Resend (Postmark SMTP)
    const origin = req.headers.get('origin') || 'http://localhost:5173'
    const resetUrl = `${origin}/verify-reset-otp?email=${encodeURIComponent(email)}&otp_id=${otpId}`

    const emailSubject = 'Password Reset OTP - WiseCare'
    const emailText = `Your password reset OTP is: ${otp}\n\nThis code will expire in 10 minutes.\n\nReset your password here: ${resetUrl}\n\nIf you didn't request this reset, please ignore this email.`
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
                                    <img src="https://zksgxfqfmtiitjypxaoi.supabase.co/storage/v1/object/public/uploads/user-f03b5240-2e87-4d75-abe7-4e1cb63a1bb8/1759159590006-wisecarelogo.png" alt="" />
                                    <h6 style="margin-top: 34px; font-weight: 700; font-size: 16px">
                                      Welcome to WiseCare!
                                    </h6>
                                    <p style="font-size: 16px; color: #000000; font-weight: 400">
                                      Here’s your one-time verification code:
                                    </p>
                                    <p style="color: #7d42fb; font-size: 24px; font-weight: 900">
                                      ${otp}
                                    </p>
                                        <p style="font-size: 16px; color: #000000; font-weight: 400; line-height: 40px;">
                                      It’s valid for the next 5 minutes. 
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
                                        <p >
                                            <a href="http://" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: white;">🌍Visit Website</a>      |   
                                            <a href="http://" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: white;">✉️ Get Support</a>  </p>
                                            <p style="margin-top: 15px; margin-bottom: 15px;">You’re receiving this email because you have a WiseCare account or were added as a beneficiary.If you’d prefer not to receive these notifications, you can [unsubscribe here].</p>
                                            <p>Registered in England & Wales | Company No. 16613659</p>
                                            <div style="display: flex; gap: 40px; justify-content: center; margin-top: 22px;"><a href="http://" target="_blank" rel="noopener noreferrer"> <img src="https://zksgxfqfmtiitjypxaoi.supabase.co/storage/v1/object/public/uploads/user-f03b5240-2e87-4d75-abe7-4e1cb63a1bb8/1759160285952-001-facebook.png" alt=""></a>
                                              <a href="http://" target="_blank" rel="noopener noreferrer"><img src="https://zksgxfqfmtiitjypxaoi.supabase.co/storage/v1/object/public/uploads/user-f03b5240-2e87-4d75-abe7-4e1cb63a1bb8/1759160243681-003-twitter.png" alt=""></a>
                                                <a href="http://" target="_blank" rel="noopener noreferrer"><img src="https://zksgxfqfmtiitjypxaoi.supabase.co/storage/v1/object/public/uploads/user-f03b5240-2e87-4d75-abe7-4e1cb63a1bb8/1759160188984-Instagram.png" alt=""></a>
                                                
                                            </div>
                                        </div>
                                        </div>
                                  </div>
                                </div>
                              </body>
                            </html>
                            `

    try {
      await sendMail({
        to: email,
        subject: emailSubject,
        text: emailText,
        html: emailHtml
      })
      console.log('Reset OTP email sent via Postmark SMTP to:', email)
    } catch (emailError) {
      // Log the error but don't fail the request to avoid email enumeration
      console.error('Failed to send reset OTP email via Postmark SMTP:', emailError)
      // Continue execution - we'll still return success to the client
    }

    return new Response(JSON.stringify({ 
      message: 'OTP sent to email',
      otp_id: otpId 
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })

  } catch (e) {
    console.error('send-reset-otp error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: 'Internal error', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})
