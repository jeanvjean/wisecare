// @ts-nocheck
// Verify signup OTP
// POST /functions/v1/verify-signup-otp
// Body: { "email": "user@example.com", "otp": "123456" }
// Response: { "message": "Email verified successfully", "phoneVerificationTriggered": true, "phoneNumber": "+1234567890" }

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
    const { email, otp } = body

    if (!email || !otp) {
      return new Response(JSON.stringify({ error: 'Email and OTP are required' }), {
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

    // Check OTP
    const userMetadata = user.user_metadata || {}
    if (userMetadata.signup_otp !== otp) {
      return new Response(JSON.stringify({ error: 'Invalid OTP' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Check if OTP is expired
    if (userMetadata.signup_otp_expires) {
      const expiresAt = new Date(userMetadata.signup_otp_expires)
      if (expiresAt < new Date()) {
        return new Response(JSON.stringify({ error: 'OTP expired' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        })
      }
    }

    // Confirm email and clear OTP
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
      user_metadata: {
        ...userMetadata,
        signup_otp: undefined,
        signup_otp_expires: undefined,
        signup_otp_id: undefined
      }
    })

    if (updateError) throw updateError

    // Check if phone number exists in user profile
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('phone_number, delivery_method_preference')
      .eq('id', user.id)
      .single();

    let phoneVerificationTriggered = false;
    let phoneNumber = null;
    let deliveryMethod = 'sms';

    if (!profileError && profile?.phone_number) {
      phoneNumber = profile.phone_number;
      deliveryMethod = profile.delivery_method_preference || 'sms';
      phoneVerificationTriggered = true;

      // Trigger phone OTP sending
      try {
        // Call send-phone-otp function internally
        const sendPhoneOtpUrl = `${SUPABASE_URL}/functions/v1/send-phone-otp`;
        const sendPhoneOtpResponse = await fetch(sendPhoneOtpUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_ROLE}`
          },
          body: JSON.stringify({
            phoneNumber: phoneNumber,
            deliveryMethod: deliveryMethod,
            email: email
          })
        });

        if (!sendPhoneOtpResponse.ok) {
          console.error('Failed to trigger phone OTP:', await sendPhoneOtpResponse.text());
          phoneVerificationTriggered = false;
        }
      } catch (phoneOtpError) {
        console.error('Error triggering phone OTP:', phoneOtpError);
        phoneVerificationTriggered = false;
      }
    }

    return new Response(JSON.stringify({
      message: 'Email verified successfully',
      phoneVerificationTriggered: phoneVerificationTriggered,
      ...(phoneNumber && { phoneNumber: phoneNumber }),
      ...(deliveryMethod && { deliveryMethod: deliveryMethod })
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })

  } catch (e) {
    console.error('verify-signup-otp error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: 'Internal error', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})