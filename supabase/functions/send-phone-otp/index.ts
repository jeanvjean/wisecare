// @ts-nocheck
// Send OTP for phone verification via SMS or WhatsApp using Twilio
// POST /functions/v1/send-phone-otp
// Body: { "phoneNumber": "+1234567890", "deliveryMethod": "sms" | "whatsapp", "country": "nigeria", "email": "user@example.com" }
// Response: { "message": "OTP sent via SMS", "otp_id": "...", "delivery_method": "sms" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendSMS, formatPhoneNumber } from '../_lib/sms.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

// Twilio configuration for WhatsApp
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')

async function sendWhatsApp({ to, message }) {
  console.log('sendWhatsApp called with:', { to, TWILIO_ACCOUNT_SID: TWILIO_ACCOUNT_SID ? 'set' : 'not set' })

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.log('WhatsApp not sent; logging to console instead (Twilio credentials or phone number not set)')
    console.log(`WhatsApp (console) -> To: ${to} | Message: ${message}`)
    return { success: true }
  }

  try {
    console.log('Attempting to send WhatsApp message via Twilio...')

    // Twilio WhatsApp API uses the same Messages endpoint with whatsapp: prefix
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`

    const body = new URLSearchParams({
      From: `whatsapp:${TWILIO_PHONE_NUMBER}`, // WhatsApp-enabled Twilio number
      To: `whatsapp:${to}`, // Recipient's WhatsApp number
      Body: message
    })

    console.log('WhatsApp request body:', { from: `whatsapp:${TWILIO_PHONE_NUMBER}`, to: `whatsapp:${to}`, body: message })

    // Create authorization header
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    })

    console.log('Twilio WhatsApp API response status:', response.status)
    const result = await response.json()
    console.log('Twilio WhatsApp API response:', result)

    if (!response.ok) {
      throw new Error(`Twilio WhatsApp API error: ${response.status} - ${result.message || 'Unknown error'}`)
    }

    console.log('WhatsApp message sent via Twilio to:', to, 'Message SID:', result.sid)
    return { success: true, message_id: result.sid }
  } catch (error) {
    console.error('Twilio WhatsApp error:', error)
    // Fallback to console logging
    console.log('WhatsApp not sent; logging to console instead')
    console.log(`WhatsApp (console) -> To: ${to} | Message: ${message}`)
    return { success: true }
  }
}

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '*'
  const requestedHeaders = req.headers.get('access-control-request-headers') || 'authorization, x-client-info, apikey, content-type, x-requested-with'
  const requestedMethod = req.headers.get('access-control-request-method') || 'POST, OPTIONS'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': requestedMethod,
    'Access-Control-Allow-Headers': requestedHeaders,
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin, Access-Control-Request-Headers, Access-Control-Request-Method'
  }
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
    })
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const body = await req.json()
    let phoneNumber = body?.phoneNumber?.trim()
    const deliveryMethod = body?.deliveryMethod || 'sms' // Default to SMS, can be 'sms' or 'whatsapp'
    const country = body?.country?.toLowerCase() || 'united_kingdom' // Default to United Kingdom
    const email = body?.email?.trim()

    // If no phone number provided, try to fetch from user profile using email
    if (!phoneNumber && email) {
      const { data: users, error: listError } = await admin.auth.admin.listUsers()
      if (listError) throw listError

      const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
      if (user) {
        // Fetch phone number from profiles table
        const { data: profile, error: profileError } = await admin
          .from('profiles')
          .select('phone_number, delivery_method_preference')
          .eq('id', user.id)
          .single();

        if (!profileError && profile?.phone_number) {
          phoneNumber = profile.phone_number;
          // Use delivery method from profile if available, otherwise use request or default
          const profileDeliveryMethod = profile.delivery_method_preference;
          if (profileDeliveryMethod && ['sms', 'whatsapp'].includes(profileDeliveryMethod)) {
            deliveryMethod = profileDeliveryMethod;
          }
        }
      }
    }

    if (!phoneNumber) {
      return new Response(JSON.stringify({ error: 'Phone number is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
      })
    }

    // Validate delivery method
    if (!['sms', 'whatsapp'].includes(deliveryMethod)) {
      return new Response(JSON.stringify({ error: 'Invalid delivery method. Must be "sms" or "whatsapp"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
      })
    }

    // Format phone number using the new SMS utility
    phoneNumber = formatPhoneNumber(phoneNumber, country)

    // Get current user from session (optional - can work without session)
    let user = null
    let foundUser = null
    const authHeader = req.headers.get('authorization')
    if (authHeader) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      const { data: { user: sessionUser }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
      if (!authError && sessionUser) {
        user = sessionUser
      }
    }

    // If we have a user session, store/update phone number in user metadata
    if (user) {
      const { error: phoneUpdateError } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          phone_number: phoneNumber,
          phone_country: country
        }
      })

      if (phoneUpdateError) throw phoneUpdateError

      // Check if phone is already verified
      if (user.user_metadata?.is_phone_number_verified) {
        return new Response(JSON.stringify({ error: 'Phone number already verified' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
        })
      }
    } else if (email) {
      // Session-less flow: require email to identify the user and store OTP in user metadata
      // Find user by email via admin
      const { data: list, error: listError } = await admin.auth.admin.listUsers()
      if (listError) {
        throw listError
      }
      foundUser = list.users.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase())
      if (!foundUser) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
        })
      }

      // Reject if already verified
      if (foundUser.user_metadata?.is_phone_number_verified) {
        return new Response(JSON.stringify({ error: 'Phone number already verified' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
        })
      }
    }

    // Determine sender country from user's profile data
    let senderCountry = 'united_kingdom'
    const targetUser = user || foundUser
    if (targetUser) {
      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('country')
        .eq('id', targetUser.id)
        .single()
      console.log({ profile, targetUserId: targetUser.id }, 'profile====>>>')
      if (!profileError && profile?.country) {
        senderCountry = profile?.country?.toLowerCase()
      }
    }

    // Generate OTP and store it temporarily
    const otp = generateOTP()
    const otpId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Store phone number and OTP on the user
    if (targetUser) {
      const { error: updateError } = await admin.auth.admin.updateUserById(targetUser.id, {
        user_metadata: {
          ...targetUser.user_metadata,
          phone_number: phoneNumber,
          phone_country: country,
          phone_otp: otp,
          phone_otp_expires: expiresAt.toISOString(),
          phone_otp_id: otpId
        }
      })
      if (updateError) throw updateError
    }

    // Send OTP message via selected delivery method
    const message = `Your WiseCare verification code is: ${otp}. This code will expire in 10 minutes.`
    console.log(`Sending OTP via ${deliveryMethod.toUpperCase()} with message:`, message, senderCountry);

    try {
      if (deliveryMethod === 'whatsapp') {
        await sendWhatsApp({
          to: phoneNumber,
          message: message
        })
        console.log(`Phone OTP sent via WhatsApp to: ${phoneNumber}`)
      } else {
        await sendSMS({
          to: phoneNumber,
          message: message,
          country: senderCountry
        })
        console.log(`Phone OTP sent via SMS to: ${phoneNumber} - ${senderCountry}`)
      }
    } catch (deliveryError) {
      console.error(`Failed to send phone OTP via ${deliveryMethod}:`, deliveryError)
      // Continue execution - we'll still return success to the client
    }

    return new Response(JSON.stringify({
      message: `OTP sent to phone number via ${deliveryMethod}`,
      otp_id: otpId,
      delivery_method: deliveryMethod,
      formatted_phone: phoneNumber
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
    })

  } catch (e) {
    console.error('send-phone-otp error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: 'Internal error', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
    })
  }
})