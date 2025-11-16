// @ts-nocheck
// Get user by email (for phone verification flow)
// POST /functions/v1/get-user-by-email
// Body: { "email": "user@example.com" }
// Response: { "phoneNumber": "+1234567890", "isPhoneVerified": false }

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

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Find user by email
    const { data: users, error: listError } = await admin.auth.admin.listUsers()
    if (listError) throw listError

    const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    return new Response(JSON.stringify({
      phoneNumber: user.user_metadata?.phone_number || null,
      isPhoneVerified: user.user_metadata?.is_phone_number_verified || false
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })

  } catch (e) {
    console.error('get-user-by-email error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: 'Internal error', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})