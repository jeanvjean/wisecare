// @ts-nocheck
// Reset password with verified token
// POST /functions/v1/reset-password
// Body: { "email": "user@example.com", "reset_token": "...", "password": "newpassword" }
// Response: { "success": true }

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
    const resetToken = body?.reset_token?.trim()
    const password = body?.password?.trim()

    if (!email || !resetToken || !password) {
      return new Response(JSON.stringify({ error: 'Email, reset token, and password are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: 'Password must be at least 6 characters' }), {
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

    // Check reset token from user metadata
    const storedToken = user.user_metadata?.reset_token
    const tokenExpires = user.user_metadata?.reset_token_expires

    if (!storedToken || !tokenExpires) {
      return new Response(JSON.stringify({ error: 'No reset token found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Check if token is expired
    if (new Date(tokenExpires) < new Date()) {
      return new Response(JSON.stringify({ error: 'Reset token has expired' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Verify token
    if (storedToken !== resetToken) {
      return new Response(JSON.stringify({ error: 'Invalid reset token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Update password
    const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, {
      password: password
    })

    if (passwordError) throw passwordError

    // Clear reset token
    const { error: clearError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        reset_token: null,
        reset_token_expires: null
      }
    })

    if (clearError) {
      console.error('Failed to clear reset token:', clearError)
      // Don't fail the request as password was already updated
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })

  } catch (e) {
    console.error('reset-password error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: 'Internal error', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})