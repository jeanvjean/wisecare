// @ts-nocheck
// WebAuthn authentication endpoint
// GET: Generate assertion options
// POST: Verify assertion and return JWT

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const JWT_SECRET = Deno.env.get('JWT_SECRET')! // This is no longer used, but kept for reference if needed for other flows

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, authorization, x-client-info, apikey, content-type'
  }
}

// Generate random challenge
function generateChallenge(): string {
  const challenge = new Uint8Array(32)
  crypto.getRandomValues(challenge)
  return btoa(String.fromCharCode(...challenge)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

 // Base64URL decode with proper padding
function base64URLDecode(str: string): Uint8Array {
  if (!str) return new Uint8Array()
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (base64.length % 4)) % 4
  const padded = base64 + '='.repeat(padLength)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// Verify WebAuthn assertion (simplified)
async function verifyAssertion(challenge: string, assertion: any, storedCredential: any, expectedOrigin: string): Promise<boolean> {
  // This is a basic verification; in production use proper library
  try {
    const clientDataJSON = JSON.parse(new TextDecoder().decode(base64URLDecode(assertion.response.clientDataJSON)))
    if (clientDataJSON.challenge !== challenge) return false
    if (clientDataJSON.origin !== expectedOrigin) return false
    // Additional signature verification would be needed
    return true
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders() })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
    const originHeader = req.headers.get('origin') || req.headers.get('referer') || 'http://localhost:3000'
    const expectedOrigin = new URL(originHeader).origin
    let rpId = new URL(originHeader).hostname
    if (rpId === '127.0.0.1') rpId = 'localhost' // WebAuthn requires 'localhost' for local development

  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/options')) {
    // Generate assertion options
    const body = await req.json()
    const email = body.email

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Find user
    const { data: users, error: userError } = await supabase.auth.admin.listUsers()
    if (userError) throw userError
    const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Get user's WebAuthn credentials
    const { data: credentials, error: credError } = await supabase
      .from('user_webauthn_credentials')
      .select('credential_id')
      .eq('user_id', user.id)

    if (credError || !credentials.length) {
      return new Response(JSON.stringify({ error: 'No WebAuthn credentials found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    const challenge = generateChallenge()

    // Store challenge temporarily (in a simple way; in production use Redis or similar)
    // For now, store in a temp table or user metadata
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        webauthn_auth_challenge: challenge
      }
    })

    const options = {
      challenge: challenge,
      // Omit allowCredentials to allow discoverable platform passkeys (Face ID/Touch ID) on-device
      userVerification: 'required',
      timeout: 60000,
      rpId: rpId,
      // Prefer using the current device (helps iOS/macOS avoid cross-device/QR flows where supported)
      hints: ['clientDevice']
    }

    return new Response(JSON.stringify(options), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }

  if (req.method === 'POST' && !new URL(req.url).pathname.endsWith('/options')) {
    // Verify assertion
    const body = await req.json()
    const email = body.email
    const assertion = body.assertion

    if (!email || !assertion) {
      return new Response(JSON.stringify({ error: 'Email and assertion required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Find user
    const { data: users, error: userError } = await supabase.auth.admin.listUsers()
    if (userError) throw userError
    const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Get stored challenge
    const storedChallenge = user.user_metadata?.webauthn_auth_challenge
    if (!storedChallenge) {
      return new Response(JSON.stringify({ error: 'No challenge found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Get credential (support both id and rawId to avoid client encoding mismatches)
    const credentialIdsToLookFor = [assertion?.rawId, assertion?.id].filter(Boolean);
    console.log(`Authenticating user ${user.id}. Looking for credentials with IDs:`, credentialIdsToLookFor);

    const { data: credentials, error: credError } = await supabase
      .from('user_webauthn_credentials')
      .select('*')
      .eq('user_id', user.id)
      .in('credential_id', credentialIdsToLookFor);

    if (credError) {
      console.error('Error fetching credentials:', credError);
    }
    console.log('Found credentials:', credentials);

    if (credError || !credentials?.length) {
      return new Response(JSON.stringify({
        error: 'Credential not found',
        lookedFor: { id: assertion?.id, rawId: assertion?.rawId },
        details: credError?.message || 'No credentials found for user'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    const storedCredential = credentials[0]

    // Verify assertion
    const isValid = await verifyAssertion(storedChallenge, assertion, storedCredential, expectedOrigin)
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid assertion' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Clear challenge
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        webauthn_auth_challenge: null
      }
    })

    // Generate a magic link and extract the token
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email!,
      options: { redirectTo: null as any }
    })
    if (linkError) {
      console.error('Failed to generate magic link for WebAuthn login:', linkError)
      return new Response(JSON.stringify({ error: 'Failed to generate session token' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    console.log('generateLink response data:', linkData) // Log the full response for debugging

    // Supabase's verifyOtp for 'magiclink' expects the 'hashed_token'
    const token = (linkData as any)?.properties?.hashed_token

    if (!token) {
      console.error('generateLink did not return hashed_token:', linkData)
      return new Response(JSON.stringify({ error: 'Session token unavailable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    console.log('Server returning hashed_token to client:', token)
    return new Response(JSON.stringify({ token }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  })
  } catch (e) {
    console.error('Unhandled error in webauthn-authenticate:', e)
    return new Response(JSON.stringify({ error: 'Internal error', details: String((e && e.message) || e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})