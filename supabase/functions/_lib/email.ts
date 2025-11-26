// supabase/functions/_lib/email.ts
// Email utility for Supabase edge functions (Deno) - matches signup function setup

import { createTransport } from 'npm:nodemailer@6.9.8'

// Email configuration for Postmark SMTP (matches signup function)
const EMAIL_FROM = (Deno.env.get('EMAIL_FROM') || 'no-reply@wisecare.co').trim()
const WELCOME_EMAIL_SENDER = (Deno.env.get('WELCOME_EMAIL_SENDER') || 'welcome@wisecare.co').trim()
const EMAIL_FROM_NAME = (Deno.env.get('EMAIL_FROM_NAME') || 'WiseCare').trim()
const SMTP_HOST = Deno.env.get('SMTP_HOST') || 'smtp.postmarkapp.com'
const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') || '587')
const SMTP_USER = Deno.env.get('SMTP_USER')!
const SMTP_PASS = Deno.env.get('SMTP_PASS')!

export async function sendMail({ to, subject, text, html, type = 'regular' }) {
  // Determine sender email based on type
  const senderEmail = type === 'welcome' ? WELCOME_EMAIL_SENDER : EMAIL_FROM

  console.log('sendMail called with:', { to, subject, senderEmail, EMAIL_FROM_NAME, SMTP_HOST, SMTP_PORT, SMTP_USER: SMTP_USER ? 'set' : 'not set', type })

  if (!SMTP_USER || !SMTP_PASS) {
    console.error('Missing SMTP credentials. Set SMTP_USER and SMTP_PASS environment variables.')
    // Fallback to console logging for development
    console.log('Email not sent; logging to console instead')
    console.log(`EMAIL (console) -> To: ${to} | Subject: ${subject}\n${text || html || ''}`)
    return { accepted: [], rejected: [to] }
  }

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
      from: `${EMAIL_FROM_NAME} <${senderEmail}>`,
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

export default { sendMail }