// @ts-nocheck
// WebAuthn registration endpoint
// GET: Generate registration options
// POST: Verify and store credential

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  verifyRegistrationResponse,
  generateRegistrationOptions
} from 'https://esm.sh/@simplewebauthn/server@10';
import type {
  VerifiedRegistrationResponse
} from 'https://esm.sh/@simplewebauthn/server@10';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }

  const origin = req.headers.get('origin') || req.headers.get('referer') || 'http://localhost:5173'
  let rpId = new URL(origin).hostname
  if (rpId === '127.0.0.1') rpId = 'localhost' // WebAuthn requires 'localhost' for local development

  if (req.method === 'GET') {
    // Generate registration options
    const userId = user.id;

    if (!user.email) {
      return new Response(JSON.stringify({ error: 'User email is required for WebAuthn registration' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    let options;
    try {
      options = await generateRegistrationOptions({
        rpName: 'WiseCare',
        rpID: rpId,
        // simplewebauthn v10+: userID must be a BufferSource (Uint8Array), not a string
        userID: new TextEncoder().encode(userId),
        userName: user.email,
        userDisplayName: user.email ?? user.id,
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          // Require resident/discoverable credentials so platform passkeys are offered
          residentKey: 'required',
          requireResidentKey: true,
          // Require biometric/strong verification to avoid cross-device (QR) fallback
          userVerification: 'required',
        },
        timeout: 60000,
        // 'none' improves UX and avoids extra prompts on iOS/macOS
        attestationType: 'none',
        // Request credProps so clients know discoverability support
        extensions: { credProps: true },
      });
      console.log('Generated registration options successfully:', {
        rpID: rpId,
        userID: userId,
        userName: user.email,
        challengeLength: options.challenge?.length,
        userIdPresent: !!options.user?.id
      })

      // For transport over JSON to the client, ensure options.user.id is a string.
      // simplewebauthn v10 requires BufferSource internally (we pass Uint8Array above),
      // but the client code expects to receive a string and then does TextEncoder().encode().
      try {
        (options as any).user = (options as any).user || {}
        ;(options as any).user.id = userId
      } catch (e) {
        console.warn('Could not set client-friendly user.id string on options:', e)
      }
    } catch (error) {
      console.error('Failed to generate registration options:', error)
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        rpID: rpId,
        userID: userId,
        userEmail: user.email
      })
      return new Response(JSON.stringify({
        error: 'Failed to generate registration options',
        details: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Validate generated options
    if (!options || typeof options !== 'object' || !options.challenge || !options.user || !options.user.id) {
      console.error('Generated options are invalid:', {
        optionsType: typeof options,
        hasChallenge: !!options?.challenge,
        hasUser: !!options?.user,
        hasUserId: !!options?.user?.id,
        fullOptions: options
      })
      return new Response(JSON.stringify({
        error: 'Failed to generate valid registration options',
        validation: {
          hasOptions: !!options,
          optionsType: typeof options,
          hasChallenge: !!options?.challenge,
          hasUser: !!options?.user,
          hasUserId: !!options?.user?.id
        }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Store challenge in user metadata
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...user.user_metadata,
        webauthn_challenge: options.challenge
      }
    });

    if (updateError) {
      console.error('Failed to store challenge:', updateError)
      console.error('Update error details:', {
        message: updateError.message,
        status: updateError.status,
        userId: userId,
        challengeLength: options.challenge?.length
      })
      return new Response(JSON.stringify({
        error: 'Failed to generate challenge',
        details: updateError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    return new Response(JSON.stringify(options), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }

  if (req.method === 'POST') {
    // Verify and store credential
    const body = await req.json()
    const credential = body.credential

    if (!credential) {
      return new Response(JSON.stringify({ error: 'Credential required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Get stored challenge
    const storedChallenge = user.user_metadata?.webauthn_challenge
    if (!storedChallenge) {
      return new Response(JSON.stringify({ error: 'No challenge found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    let verification: VerifiedRegistrationResponse;
    try {
      verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: storedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        requireUserVerification: false, // Adjust as per your policy
      });
      console.log('Verification result:', { verified: verification.verified, registrationInfoPresent: !!verification.registrationInfo });
      if (!verification.verified) {
        console.error('Credential not verified by simplewebauthn:', verification);
      }
    } catch (error) {
      console.error('Failed to verify credential with simplewebauthn:', error);
      return new Response(JSON.stringify({ error: 'Invalid credential', details: error.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });
    }

    const { verified, registrationInfo } = verification;

    if (!verified || !registrationInfo) {
      console.error('Credential verification failed: verified=', verified, 'registrationInfo=', registrationInfo);
      return new Response(JSON.stringify({ error: 'Credential verification failed', verified, registrationInfoPresent: !!registrationInfo }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });
    }

    const {
      credentialPublicKey,
      credentialID,
      counter,
    } = registrationInfo;

    // Helpers to base64url-encode buffers
    const toBase64URL = (bytes: Uint8Array) =>
      btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    // Convert key and id to base64url strings for storage
    console.log('Raw credentialID before conversion:', credentialID, 'Type:', typeof credentialID, 'Is ArrayBuffer:', credentialID instanceof ArrayBuffer);
    const public_key_base64 = toBase64URL(new Uint8Array(credentialPublicKey));
    let credential_id_base64: string;
    if (typeof credentialID === 'string') {
      credential_id_base64 = credentialID;
    } else if (credentialID instanceof ArrayBuffer) {
      credential_id_base64 = toBase64URL(new Uint8Array(credentialID));
    } else {
      console.error('Unexpected type for credentialID:', credentialID);
      throw new Error('Invalid credentialID type');
    }
    console.log('Storing credential with ID:', credential_id_base64);

    console.log('Attempting to insert credential into DB...');
    // Store credential
    const { error: insertError } = await supabase
      .from('user_webauthn_credentials')
      .insert({
        user_id: user.id,
        // Store credential_id as base64url string to match client rawId
        credential_id: credential_id_base64,
        public_key: public_key_base64, // Store the base64URL encoded public key
        counter: counter,
        transports: credential.response.transports || [],
      });

    if (insertError) {
      console.error('Failed to store credential:', insertError);
      console.error('Insert error details:', {
        message: insertError.message,
        status: insertError.status,
        userId: user.id,
        credentialId: credential_id_base64,
      });
      return new Response(JSON.stringify({ error: 'Failed to store credential', details: insertError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    } else {
      console.log('Credential successfully stored for user:', user.id, 'Credential ID:', credential_id_base64);
    }

    // Clear challenge
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        webauthn_challenge: null
      }
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  })
})