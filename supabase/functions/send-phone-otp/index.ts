// @ts-nocheck
// Send OTP for phone verification via SMS or WhatsApp
// POST /functions/v1/send-phone-otp
// Body: { "phoneNumber": "+1234567890", "deliveryMethod": "sms" | "whatsapp" }
// Response: { "message": "OTP sent via SMS", "otp_id": "...", "delivery_method": "sms" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

// SMS configuration - using SendChamp SMS service
const SENDCHAMP_PUBLIC_KEY = Deno.env.get('SENDCHAMP_PUBLIC_KEY')
const SENDCHAMP_MODE = Deno.env.get('SENDCHAMP_MODE') || 'live'
const DEFAULT_PHONE_COUNTRY_CODE = Deno.env.get('DEFAULT_PHONE_COUNTRY_CODE') || '+234' // Default to +234 (Nigeria) if not set
const SENDCHAMP_WHATSAPP_SENDER = Deno.env.get('SENDCHAMP_WHATSAPP_SENDER') || 'your_business_name' // WhatsApp sender name

async function sendSMS({ to, message }) {
  console.log('sendSMS called with:', { to, SENDCHAMP_PUBLIC_KEY: SENDCHAMP_PUBLIC_KEY ? 'set' : 'not set', SENDCHAMP_MODE })

  if (!SENDCHAMP_PUBLIC_KEY) {
    console.log('SMS not sent; logging to console instead (SENDCHAMP_PUBLIC_KEY not set)')
    console.log(`SMS (console) -> To: ${to} | Message: ${message}`)
    return { success: true }
  }

  try {
    console.log('Attempting to send SMS via SendChamp...')
    const response = await fetch('https://api.sendchamp.com/api/v1/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SENDCHAMP_PUBLIC_KEY}`
      },
      body: JSON.stringify({
        to: to,
        message: message,
        sender_name: 'Sendchamp',
        route: 'dnd'
      })
    })

    console.log('SendChamp API response status:', response.status)
    const result = await response.json()
    console.log('SendChamp API response:', result)

    if (response.ok && result.status === 'success') {
      console.log('SMS sent via SendChamp to:', to)
      return { success: true, message_id: result.data.uid }
    } else {
      console.error('SendChamp SMS failed:', result)
      throw new Error(result.message || 'SMS sending failed')
    }
  } catch (error) {
    console.error('SendChamp SMS error:', error)
    // Fallback to console logging
    console.log('SMS not sent; logging to console instead')
    console.log(`SMS (console) -> To: ${to} | Message: ${message}`)
    return { success: true }
  }
}

async function sendWhatsApp({ to, message }) {
  console.log('sendWhatsApp called with:', { to, SENDCHAMP_PUBLIC_KEY: SENDCHAMP_PUBLIC_KEY ? 'set' : 'not set', SENDCHAMP_MODE })

  if (!SENDCHAMP_PUBLIC_KEY) {
    console.log('WhatsApp not sent; logging to console instead (SENDCHAMP_PUBLIC_KEY not set)')
    console.log(`WhatsApp (console) -> To: ${to} | Message: ${message}`)
    return { success: true }
  }

  try {
    console.log('Attempting to send WhatsApp message via SendChamp...')
    
    // SendChamp WhatsApp API requires different format and headers
    // Based on SendChamp documentation, WhatsApp uses different endpoint and possibly different auth
    const requestBody = {
      recipient: to,
      sender: SENDCHAMP_WHATSAPP_SENDER,
      message: message,
      type: 'text'
    }

    console.log('WhatsApp request body:', requestBody)
    
    const response = await fetch('https://api.sendchamp.com/api/v1/whatsapp/message/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SENDCHAMP_PUBLIC_KEY}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    console.log('SendChamp WhatsApp API response status:', response.status)
    const result = await response.json()
    console.log('SendChamp WhatsApp API response:', result)

    if (response.ok) {
      console.log('WhatsApp message sent via SendChamp to:', to)
      return { success: true, message_id: result.data?.id || result.id }
    } else {
      console.error('SendChamp WhatsApp failed:', result)
      throw new Error(result.message || result.error || 'WhatsApp sending failed')
    }
  } catch (error) {
    console.error('SendChamp WhatsApp error:', error)
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

    // Prepend default country code if not already present and a default is configured
    if (!phoneNumber.startsWith('+') && DEFAULT_PHONE_COUNTRY_CODE) {
      phoneNumber = DEFAULT_PHONE_COUNTRY_CODE + phoneNumber
    }

    // Get current user from session (optional - can work without session)
    let user = null
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
          phone_number: phoneNumber
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
    }

    // Generate OTP and store it temporarily
    const otp = generateOTP()
    const otpId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Store OTP in user metadata if we have a user, otherwise we'll need to handle this differently
    if (user) {
      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          phone_otp: otp,
          phone_otp_expires: expiresAt.toISOString(),
          phone_otp_id: otpId
        }
      })

      if (updateError) throw updateError
    } else {
      // Session-less flow: require email to identify the user and store OTP in user metadata
      const email = body?.email?.trim()
      if (!email) {
        return new Response(JSON.stringify({ error: 'Email is required when not authenticated' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
        })
      }

      // Find user by email via admin
      const { data: list, error: listError } = await admin.auth.admin.listUsers()
      if (listError) {
        throw listError
      }
      const foundUser = list.users.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase())
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

      // Store phone number and OTP on the user
      const { error: updateAnonError } = await admin.auth.admin.updateUserById(foundUser.id, {
        user_metadata: {
          ...foundUser.user_metadata,
          phone_number: phoneNumber,
          phone_otp: otp,
          phone_otp_expires: expiresAt.toISOString(),
          phone_otp_id: otpId
        }
      })
      if (updateAnonError) throw updateAnonError
    }

    // Send OTP message via selected delivery method
    const message = `Your WiseCare verification code is: ${otp}. This code will expire in 10 minutes.`
    console.log(`Sending OTP via ${deliveryMethod.toUpperCase()} with message:`, message);

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
          message: message
        })
        console.log(`Phone OTP sent via SMS to: ${phoneNumber}`)
      }
    } catch (deliveryError) {
      console.error(`Failed to send phone OTP via ${deliveryMethod}:`, deliveryError)
      // Continue execution - we'll still return success to the client
    }

    return new Response(JSON.stringify({
      message: `OTP sent to phone number via ${deliveryMethod}`,
      otp_id: otpId,
      delivery_method: deliveryMethod
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