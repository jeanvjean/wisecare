// @ts-nocheck
// Verify OTP for password reset
// POST /functions/v1/verify-reset-otp
// Body: { "email": "user@example.com", "otp": "123456" }
// Response: { "verified": true, "reset_token": "..." }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const body = await req.json()
    const email = body?.email?.trim()
    const otp = body?.otp?.trim()

    if (!email || !otp) {
      return new Response(JSON.stringify({ error: 'Email and OTP are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Find user by email
    const { data: users, error: userError } = await admin.auth.admin.listUsers()
    if (userError) throw userError

    const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Check OTP from user metadata
    const storedOtp = user.user_metadata?.reset_otp
    const expiresAt = user.user_metadata?.reset_otp_expires
    const otpId = user.user_metadata?.reset_otp_id

    if (!storedOtp || !expiresAt) {
      return new Response(JSON.stringify({ error: 'No OTP found or expired' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Check if OTP is expired
    if (new Date(expiresAt) < new Date()) {
      return new Response(JSON.stringify({ error: 'OTP has expired' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Verify OTP
    if (storedOtp !== otp) {
      return new Response(JSON.stringify({ error: 'Invalid OTP' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Generate reset token
    const resetToken = crypto.randomUUID()
    const resetTokenExpires = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    // Clear OTP and set reset token
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        reset_otp: null,
        reset_otp_expires: null,
        reset_otp_id: null,
        reset_token: resetToken,
        reset_token_expires: resetTokenExpires.toISOString()
      }
    })

    if (updateError) throw updateError

    return new Response(JSON.stringify({ 
      verified: true,
      reset_token: resetToken,
      user_id: user.id
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })

  } catch (e) {
    console.error('verify-reset-otp error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: 'Internal error', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})