// @ts-nocheck
// User signin via edge function
// POST /functions/v1/signin
// Body: { "email": "user@example.com", "password": "password" }
// Response: { "access_token": "...", "refresh_token": "...", "user": {...} }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const CHARGEBEE_SITE = Deno.env.get('CHARGEBEE_SITE') || 'enyata-test'
const CHARGEBEE_API_KEY = Deno.env.get('CHARGEBEE_API_KEY') || 'test_WDOffoOLVp4VmsweeaBcdSlcureDbvGoAF'

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
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const body = await req.json()
    const { email, password } = body

    console.log('signin request body:', JSON.stringify(body))
    console.log('email:', email, 'password:', password)
    console.log('email type:', typeof email, 'password type:', typeof password)
    console.log('email empty?:', !email, 'password empty?:', !password)

    if (!email || !password) {
      console.error('Missing fields - email:', email, 'password:', password)
      return new Response(JSON.stringify({ error: 'All fields are required', debug: { email: !!email, password: !!password } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Sign in with password
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      if (error.message === 'Email not confirmed') {
        // Look up the user by email to get their ID
        const { data: user, error: userError } = await supabase.from('users').select('id').eq('email', email).single()

        if (userError) {
          return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders() }
          })
        }

        // Resend the confirmation email
        const { error: resendError } = await supabase.auth.resend({
          type: 'signup',
          email: email
        })

        if (resendError) {
          return new Response(JSON.stringify({ error: resendError.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders() }
          })
        }

        return new Response(JSON.stringify({ error: 'Email not confirmed. A new confirmation email has been sent.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() }
        })
      }

      return new Response(JSON.stringify({ error: error.message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Fetch the user's profile to get the unique_id
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('unique_id')
      .eq('id', data.user.id)
      .single()

    if (profileError) {
      console.error('Error fetching profile for unique_id:', profileError)
      // Continue without unique_id if there's an error, or return an error if critical
      // For now, we'll just log and proceed without it in the user_metadata
    }

    // Add unique_id to user_metadata if available
    const userWithUniqueId = {
      ...data.user,
      user_metadata: {
        ...data.user?.user_metadata,
        unique_id: profileData?.unique_id || data.user?.user_metadata?.unique_id || null,
      },
    }

    // Fetch subscription history from Chargebee and add to user_metadata
    let subscriptionHistory = null
    try {
      // First try to find Chargebee customer ID by testing subscriptions
      let chargebeeCustomerId = null
      const testUrl = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions?customer_id[is]=${encodeURIComponent(data.user.id)}&limit=1`
      const testRes = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
          'Accept': 'application/json'
        }
      })
      if (testRes.ok) {
        const testPayload = await testRes.json()
        const first = (testPayload.list || [])[0]
        if (first?.subscription?.customer_id) {
          chargebeeCustomerId = first.subscription.customer_id
        }
      }

      // Fallback: find customer by email
      if (!chargebeeCustomerId && data.user.email) {
        const custRes = await fetch(`https://${CHARGEBEE_SITE}.chargebee.com/api/v2/customers?email[is]=${encodeURIComponent(data.user.email)}&limit=1`, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
            'Accept': 'application/json'
          }
        })
        if (custRes.ok) {
          const custPayload = await custRes.json()
          chargebeeCustomerId = (custPayload.list || [])[0]?.customer?.id || null
        }
      }

      // If we have a customer ID, fetch all subscriptions
      if (chargebeeCustomerId) {
        const subRes = await fetch(`https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions?customer_id[is]=${encodeURIComponent(chargebeeCustomerId)}&sort_by[desc]=created_at&limit=100`, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
            'Accept': 'application/json'
          }
        })
        if (subRes.ok) {
          const subPayload = await subRes.json()
          const subscriptions = (subPayload.list || []).map((item: any) => ({
            id: item.subscription.id,
            status: item.subscription.status,
            created_at: item.subscription.created_at,
            current_term_start: item.subscription.current_term_start,
            current_term_end: item.subscription.current_term_end,
            cancelled_at: item.subscription.cancelled_at || null,
            item_price_id: item.subscription.subscription_items?.[0]?.item_price_id || null
          }))
          subscriptionHistory = subscriptions.length > 0 ? subscriptions : []
        }
      }
    } catch (error) {
      console.error('Error fetching subscription history during signin:', error)
      // Continue without subscription history if there's an error
    }

    // Add subscription history to user_metadata and compute active/ever flags
    let hasActiveSubscription = false
    let hasEverHadSubscription = false

    if (Array.isArray(subscriptionHistory)) {
      // Use Chargebee-sourced history when available
      hasActiveSubscription = subscriptionHistory.some((s: any) => (s.status || '').toLowerCase() === 'active')
      hasEverHadSubscription = subscriptionHistory.length > 0
    } else {
      // Fallback to local DB (public.subscriptions) if Chargebee is unavailable or returned nothing
      try {
        const { data: localSubs, error: localErr } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('user_id', data.user.id)
        if (!localErr && Array.isArray(localSubs)) {
          hasActiveSubscription = localSubs.some((s: any) => (s.status || '').toLowerCase() === 'active')
          hasEverHadSubscription = localSubs.length > 0
        }
      } catch (e) {
        console.error('Error querying local subscriptions during signin fallback:', e)
      }
    }

    const userWithMetadata = {
      ...userWithUniqueId,
      user_metadata: {
        ...userWithUniqueId.user_metadata,
        subscription_history: subscriptionHistory,
        has_active_subscription: hasActiveSubscription,
        has_ever_had_subscription: hasEverHadSubscription
      },
    }

    // Check verification status
    const userMetadata = userWithMetadata?.user_metadata || {}
    const needsEmailVerification = !userWithMetadata?.email_confirmed_at
    const needsPhoneVerification = !userMetadata.is_phone_number_verified
    const needsOnboarding = !userMetadata.onboarding_completed
    // Prompt for plan selection on login if onboarding is complete but no active subscription exists
    // Users can skip this once and won't be prompted again on future logins
    const needsPlanSelection = userMetadata.onboarding_completed && !userMetadata.subscription_id && !userMetadata.plan_skipped

    // Always return session with verification flags - let client decide routing
    return new Response(JSON.stringify({
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_at: data.session?.expires_at,
        token_type: data.session?.token_type,
        user: userWithMetadata
      },
      needsEmailVerification,
      needsPhoneVerification,
      needsOnboarding,
      needsPlanSelection
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })


  } catch (e) {
    console.error('signin error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: 'Internal error', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})