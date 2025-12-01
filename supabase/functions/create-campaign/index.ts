// @ts-nocheck
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
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const {
      name,
      description,
      code,
      discountType,
      discountValue,
      validFrom,
      validUntil,
      usageLimit,
      applicablePlans,
      chargebeeCouponId
    } = await req.json()

    // Validate required fields
    if (!name || !discountType || discountValue === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Validate discount type
    if (!['fixed', 'percentage'].includes(discountType)) {
      return new Response(JSON.stringify({ error: 'Invalid discount type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Validate discount value
    if (discountType === 'percentage' && (discountValue < 0 || discountValue > 1)) {
      return new Response(JSON.stringify({ error: 'Percentage discount must be between 0 and 1' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    if (discountType === 'fixed' && discountValue < 0) {
      return new Response(JSON.stringify({ error: 'Fixed discount cannot be negative' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // IMPORTANT:
    // Chargebee Product Catalog 2.0 sites do NOT support using the /coupons API
    // to create coupons programmatically (this is why you see the
    // pc2_to_pc1_error: "calling product catalog 1.0 API endpoint").
    //
    // To avoid this incompatibility, we NO LONGER call Chargebee's /coupons endpoint.
    // Instead:
    //   - You create the coupon manually in the Chargebee dashboard.
    //   - You pass its ID to this function as `chargebeeCouponId`.
    //   - We store that mapping in the `campaigns` table and use it later
    //     in create-checkout via coupon_ids[0].
    //
    // If chargebeeCouponId is not provided, we fall back to using `code`
    // so you can name your Chargebee coupon the same as the campaign code.
    const resolvedCouponId = (chargebeeCouponId || code || '').trim()

    if (!resolvedCouponId) {
      return new Response(JSON.stringify({
        error: 'Missing chargebeeCouponId',
        details: 'Provide chargebeeCouponId or ensure code matches an existing Chargebee coupon ID'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // Create campaign in database only (no Chargebee API call)
    const { data: campaign, error: dbError } = await admin
      .from('campaigns')
      .insert({
        name,
        description,
        code,
        discount_type: discountType,
        discount_value: discountValue,
        chargebee_coupon_id: resolvedCouponId,
        valid_from: validFrom,
        valid_until: validUntil,
        usage_limit: usageLimit,
        applicable_plans: applicablePlans
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)

      return new Response(JSON.stringify({ error: dbError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    return new Response(JSON.stringify({
      message: 'Campaign created successfully (no Chargebee API call)',
      campaign
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })

  } catch (error) {
    console.error('create-campaign error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: 'Internal error', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})