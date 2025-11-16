// @ts-nocheck
// Securely upsert a local subscription row using service role, after verifying the caller identity
// and (optionally) validating the Chargebee subscription belongs to the caller.
//
// POST /functions/v1/upsert-subscription
// Headers:
//   Authorization: Bearer <user_access_token>   <-- REQUIRED (real user JWT from supabase.auth.getSession())
//   apikey: <anon key>                          <-- as usual
// Body (JSON):
// {
//   "subscription_id": "sub_xxx",                // Chargebee subscription id (required)
//   "status": "active",                          // 'active' | 'cancelled' | ...
//   "current_period_start": "2025-09-01T00:00:00.000Z",
//   "current_period_end": "2025-10-01T00:00:00.000Z",
//   "billing_period_unit": "month"               // 'month' | 'year' | ...
// }
//
// Response 200:
// {
//   "subscription": {
//     "id": "<local_subscriptions_row_id>",
//     "user_id": "...",
//     "chargebee_subscription_id": "sub_xxx",
//     "status": "active",
//     "current_period_start": "...",
//     "current_period_end": "...",
//     "payment_frequency": "month"
//   }
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing Authorization bearer token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Use service role to look up the user by provided JWT
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token', details: userErr?.message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }
    const userId = userData.user.id as string

    const body = await req.json()
    const subId = String(body?.subscription_id || '').trim()
    const status = String(body?.status || '').trim() || 'active'
    const cps = body?.current_period_start ? new Date(body.current_period_start) : null
    const cpe = body?.current_period_end ? new Date(body.current_period_end) : null
    const periodUnit = body?.billing_period_unit ? String(body.billing_period_unit).toLowerCase() : null

    if (!subId) {
      return new Response(JSON.stringify({ error: 'subscription_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Optional: Validate with Chargebee that subscription belongs to this user (customer_id == supabase user id)
    const cbRes = await fetch(`https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions/${encodeURIComponent(subId)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
        'Accept': 'application/json'
      }
    })
    if (!cbRes.ok) {
      const text = await cbRes.text()
      return new Response(JSON.stringify({
        error: 'Chargebee validation failed',
        upstream_status: cbRes.status,
        upstream_body: tryParse(text)
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }
    const cbPayload = await cbRes.json()
    const cbSub = cbPayload?.subscription
    const cbCustomerId = cbSub?.customer_id

    // Only proceed if Chargebee customer_id matches the Supabase user id we embed during checkout
    if (!cbCustomerId || cbCustomerId !== userId) {
      return new Response(JSON.stringify({
        error: 'Ownership check failed',
        details: 'Chargebee subscription does not belong to the authenticated user'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    const record = {
      user_id: userId,
      chargebee_subscription_id: subId,
      status,
      current_period_start: cps ? cps.toISOString() : null,
      current_period_end: cpe ? cpe.toISOString() : null,
      payment_frequency: periodUnit
    }

    const { data, error } = await admin
      .from('subscriptions')
      .upsert(record, { onConflict: 'chargebee_subscription_id' })
      .select('*')
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: 'DB upsert failed', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    return new Response(JSON.stringify({ subscription: data }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: 'Internal error', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})

function tryParse(text: string) {
  try { return JSON.parse(text) } catch { return text }
}