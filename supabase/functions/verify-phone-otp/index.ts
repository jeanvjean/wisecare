// @ts-nocheck
// Verify phone OTP
// POST /functions/v1/verify-phone-otp
// Body: { "phoneNumber": "+1234567890", "otp": "123456" }
// Response: { "message": "Phone number verified successfully" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
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
    const { phoneNumber, otp } = body

    if (!phoneNumber || !otp) {
      return new Response(JSON.stringify({ error: 'Phone number and OTP are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
      })
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

    // Check OTP - different logic for session vs session-less
    let isValidOTP = false
    let userMetadata = {}

    if (user) {
      // Session-based verification
      userMetadata = user.user_metadata || {}

      console.log('Session-based verification attempt:', {
        providedPhone: phoneNumber,
        storedPhone: userMetadata.phone_number,
        hasOTP: !!userMetadata.phone_otp,
        providedOTP: otp
      })

      if (userMetadata.phone_otp !== otp) {
        return new Response(JSON.stringify({ error: 'Invalid OTP' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
        })
      }

      // Check if OTP is expired
      if (userMetadata.phone_otp_expires) {
        const expiresAt = new Date(userMetadata.phone_otp_expires)
        if (expiresAt < new Date()) {
          return new Response(JSON.stringify({ error: 'OTP expired' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
          })
        }
      }

      isValidOTP = true
    } else {
      // Session-less verification will be handled below after loading user by email
      isValidOTP = false
    }

    // Handle verification differently based on whether we have a session
    if (user) {
      // Session-based: update user metadata
      const phoneToVerify = userMetadata.phone_number || phoneNumber

      console.log('Phone number to verify:', phoneToVerify)

      // Verify phone number and clear OTP
      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...userMetadata,
          phone_number: phoneToVerify, // Store the verified phone number
          is_phone_number_verified: true,
          phone_otp: undefined,
          phone_otp_expires: undefined,
          phone_otp_id: undefined
        }
      })

      if (updateError) throw updateError

      // Mirror phone verification to public.profiles (session-based)
      const { error: profileErr } = await admin
        .from('profiles')
        .update({ is_phone_number_verified: true })
        .eq('id', user.id)
        .single()

      if (profileErr) {
        console.error('Failed to mirror phone verification to profiles (session):', profileErr)
        // Continue without throwing to match existing behavior
      }
    } else {
      // Session-less verification: require email, validate OTP from user_metadata, verify phone, and return a recovery email OTP
      const email = (body.email || '').trim()
      if (!email) {
        return new Response(JSON.stringify({ error: 'Email is required for session-less verification' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
        })
      }

      // Find user by email
      const { data: foundUsers, error: findError } = await admin.auth.admin.listUsers()
      if (findError) throw findError

      const foundUser = foundUsers?.users?.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase())
      if (!foundUser) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
        })
      }

      const meta = foundUser.user_metadata || {}

      // Validate OTP and expiry using stored metadata
      if (meta.phone_otp !== otp) {
        return new Response(JSON.stringify({ error: 'Invalid OTP' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
        })
      }

      if (meta.phone_otp_expires) {
        const expiresAt = new Date(meta.phone_otp_expires)
        if (expiresAt < new Date()) {
          return new Response(JSON.stringify({ error: 'OTP expired' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
          })
        }
      }

      // Verify phone number and clear OTP fields. Prefer stored number, fallback to provided.
      const phoneToVerify = meta.phone_number || phoneNumber
      const { error: updateError } = await admin.auth.admin.updateUserById(foundUser.id, {
        user_metadata: {
          ...meta,
          phone_number: phoneToVerify,
          is_phone_number_verified: true,
          phone_otp: undefined,
          phone_otp_expires: undefined,
          phone_otp_id: undefined
        }
      })
      if (updateError) throw updateError

      // Mirror phone verification to public.profiles (session-less)
      const { error: profileErr2 } = await admin
        .from('profiles')
        .update({ is_phone_number_verified: true })
        .eq('id', foundUser.id)
        .single()

      if (profileErr2) {
        console.error('Failed to mirror phone verification to profiles (session-less):', profileErr2)
        // Continue without throwing to match existing behavior
      }

      // Generate a recovery OTP so the frontend can establish a real session via supabase.auth.verifyOtp
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email
      })
      if (linkError) throw linkError

      const email_otp = linkData?.properties?.email_otp
      if (!email_otp) {
        return new Response(JSON.stringify({ error: 'Failed to generate recovery OTP' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
        })
      }

      return new Response(JSON.stringify({
        message: 'Phone number verified successfully',
        email_otp
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
      })
    }

    return new Response(JSON.stringify({ message: 'Phone number verified successfully' }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
    })

  } catch (e) {
    console.error('verify-phone-otp error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: 'Internal error', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) }
    })
  }
})