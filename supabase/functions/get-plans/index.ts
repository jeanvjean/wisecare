// @ts-nocheck
// Fallback to hardcoded values if env vars are not set (for debugging)
const CHARGEBEE_SITE = Deno.env.get('CHARGEBEE_SITE') || 'enyata-test'
const CHARGEBEE_API_KEY = Deno.env.get('CHARGEBEE_API_KEY') || 'test_WDOffoOLVp4VmsweeaBcdSlcureDbvGoAF'
const CURRENCY_API_KEY = Deno.env.get('CURRENCY_API_KEY') || 'cur_live_xxxxxxxxxxxxxxxxxxxxxxxxx' // Replace with a valid key for testing

const SUPPORTED_CURRENCIES: { [key: string]: string } = {
  GB: 'GBP', // United Kingdom
  US: 'USD', // United States
  CA: 'CAD', // Canada
  NG: 'NGN', // Nigeria
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  try {
    console.log('Fetching plans from Chargebee...')
    console.log('CHARGEBEE_SITE:', CHARGEBEE_SITE)
    console.log('CHARGEBEE_API_KEY exists:', !!CHARGEBEE_API_KEY)
    
    // Use Product Catalog 2.0 item_prices with pagination
    // Remove server-side filters entirely; filter locally to avoid API incompatibilities
    const baseUrl = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/item_prices?limit=100`
    console.log('Chargebee URL (PC 2.0 - item_prices):', baseUrl)
    
    // Fetch ALL pages from Chargebee Product Catalog 2.0 (server-side; avoids browser CORS)
    const allItems: any[] = []
    let next_offset: string | null = null
    let page = 1
    while (true) {
      const url = next_offset ? `${baseUrl}&offset=${encodeURIComponent(next_offset)}` : baseUrl
      console.log(`Fetching item_prices page ${page} url:`, url)
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
          'Accept': 'application/json'
        }
      })
  
      console.log('Chargebee response status:', response.status)
      console.log('Chargebee response headers:', Object.fromEntries(response.headers.entries()))
  
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Chargebee API error response:', errorText)
        throw new Error(`Chargebee API error: ${response.status} - ${errorText}`)
      }
  
      const payload = await response.json()
      const list = payload.list || []
      console.log(`Fetched ${list.length} item_prices on page ${page}`)
      allItems.push(...list)
  
      next_offset = payload.next_offset || null
      if (!next_offset) break
      page += 1
    }

    // Aggregated result across all pages
    console.log('Chargebee aggregated item_prices count:', allItems.length)

    // Get currency from query parameter or determine from headers
    const url = new URL(req.url)
    let targetCurrency = url.searchParams.get('currency') || 'USD'
    let useCurrency = Object.keys(SUPPORTED_CURRENCIES).includes(targetCurrency) ? SUPPORTED_CURRENCIES[targetCurrency] : 'USD'
    console.log('Target currency:', useCurrency)

    // Transform Chargebee item prices (Product Catalog 2.0) to our format
    // Filter to likely "plan" prices by requiring period + period_unit (recurring)
    const plans = (allItems || [])
      .map((it: any) => it.item_price)
      // Ensure we only expose actual plan item prices (exclude addons/charges)
      .filter((ip: any) => ip && ip.status === 'active' && ip.item_type === 'plan' && (ip.currency_code || 'USD').toUpperCase() === useCurrency.toUpperCase())
      .map((ip: any) => ({
        // For PC 2.0, item price is the purchasable entity
        id: ip.id, // keep for backwards compatibility
        item_price_id: ip.id,
        item_id: ip.item_id,
        name: ip.name || ip.item_id,
        description: ip.description || 'Healthcare plan',
        // Chargebee returns price in minor units; prefer price_in_decimal when available
        price: ip.price_in_decimal ? parseFloat(ip.price_in_decimal) : (typeof ip.price === 'number' ? ip.price / 100 : 0),
        currency: ip.currency_code || 'USD',
        period: ip.period || 1,
        period_unit: (ip.period_unit || 'month').toLowerCase(),
        status: ip.status
      }))

    console.log('Transformed plans:', plans.length, 'active plans found')

    // Optional quantity preview for tier computations
    const quantityParam = url.searchParams.get('quantity')
    const previewQuantity = quantityParam ? Math.max(0, Math.floor(Number(quantityParam))) : 0

    // If quantity is provided, compute server-side totals with tiered pricing
    // We compute in the native currency returned by Chargebee and skip client-facing conversion here
    if (previewQuantity > 0) {
      console.log('Computing plan previews with quantity:', previewQuantity)
      const withTotals: any[] = []
      for (const plan of plans) {
        try {
          const detailRes = await fetch(`https://${CHARGEBEE_SITE}.chargebee.com/api/v2/item_prices/${encodeURIComponent(plan.item_price_id)}`, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
              'Accept': 'application/json'
            }
          })
          if (!detailRes.ok) {
            const t = await detailRes.text()
            console.error('Failed to fetch item_price detail for preview:', plan.item_price_id, detailRes.status, t)
            withTotals.push({
              ...plan,
              quantity: previewQuantity,
              pricing_mode: 'per_unit',
              computed_total: plan.price * previewQuantity,
              breakdown: [{
                tier_from: 1, tier_to: null, units: previewQuantity, unit_price: plan.price, subtotal: parseFloat((plan.price * previewQuantity).toFixed(2))
              }]
            })
            continue
          }
          const detailPayload = await detailRes.json()
          const ip = detailPayload.item_price || {}
          const unitPrice = getUnitPriceDecimal(ip) ?? plan.price
          const pricingMode = (ip.tiers_mode || ip.pricing_model || 'per_unit').toLowerCase()
          const tiers = Array.isArray(ip.tiers) ? ip.tiers : []
          const comp = computeTotalForQuantity({
            mode: pricingMode,
            tiers,
            unit_price: unitPrice,
            quantity: previewQuantity
          })
          withTotals.push({
            ...plan,
            // Ensure we reflect the native currency/unit price from Chargebee
            price: unitPrice,
            currency: ip.currency_code || plan.currency,
            quantity: previewQuantity,
            pricing_mode: pricingMode,
            computed_total: comp.total,
            breakdown: comp.breakdown
          })
        } catch (e) {
          console.error('Exception computing plan preview total:', e)
          withTotals.push({
            ...plan,
            quantity: previewQuantity,
            pricing_mode: 'per_unit',
            computed_total: plan.price * previewQuantity,
            breakdown: [{
              tier_from: 1, tier_to: null, units: previewQuantity, unit_price: plan.price, subtotal: parseFloat((plan.price * previewQuantity).toFixed(2))
            }]
          })
        }
      }
      return new Response(JSON.stringify(withTotals), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
        }
      })
    }

    // No quantity preview requested: ignore currency conversion and echo quantity=0
    const basePlans = plans.map((plan: any) => ({
      ...plan,
      quantity: 0
    }))

    return new Response(JSON.stringify(basePlans), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    })
  } catch (error) {
    console.error('Error fetching plans:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: errorMessage,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
})

// ---------- Helpers for tiered pricing computation ----------

function toDecimal(val?: any): number | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'string') {
    const f = parseFloat(val)
    return Number.isFinite(f) ? f : null
  }
  if (typeof val === 'number') {
    return val / 100
  }
  return null
}

function getUnitPriceDecimal(ip: any): number | null {
  const dec = toDecimal(ip?.price_in_decimal)
  if (dec !== null) return dec
  return toDecimal(ip?.price)
}

/**
 * Compute total for a given quantity based on Chargebee item_price tiers
 * Supports:
 *  - per_unit (no tiers): total = quantity * unit_price
 *  - volume: find tier by quantity then total = quantity * tier_unit_price
 *  - graduated/stairstep: allocate quantity across tiers and sum subtotals
 */
function computeTotalForQuantity(args: {
  mode: string | null,
  tiers: any[],
  unit_price: number | null,
  quantity: number
}): { total: number | null, breakdown: Array<{ tier_from: number, tier_to: number | null, units: number, unit_price: number, subtotal: number }> } {
  const mode = (args.mode || 'per_unit').toLowerCase()
  const tiers = args.tiers || []
  const unit_price = args.unit_price
  const q = Math.max(0, Math.floor(args.quantity || 0))
  const breakdown: Array<{ tier_from: number, tier_to: number | null, units: number, unit_price: number, subtotal: number }> = []

  if (!tiers || tiers.length === 0 || mode === 'per_unit' || mode === 'flat_fee' || unit_price === null) {
    const total = unit_price === null ? null : round2((unit_price || 0) * q)
    if (total !== null && q > 0 && unit_price !== null) {
      breakdown.push({
        tier_from: 1,
        tier_to: null,
        units: q,
        unit_price: unit_price,
        subtotal: total
      })
    }
    return { total, breakdown }
  }

  const norm = tiers.map((t: any) => {
    const start = Number(t.starting_unit || t.start_unit || t.from || 1)
    const endRaw = t.ending_unit ?? t.end_unit ?? t.to ?? null
    const end = endRaw === null || endRaw === undefined ? null : Number(endRaw)
    const tierUnitPrice = toDecimal(t.price_in_decimal) ?? toDecimal(t.price) ?? unit_price ?? 0
    return { start, end, price: tierUnitPrice }
  }).sort((a, b) => a.start - b.start)

  if (mode === 'volume') {
    let chosen = norm[norm.length - 1]
    for (const t of norm) {
      const inRange = q >= t.start && (t.end === null || q <= t.end)
      if (inRange) { chosen = t; break }
    }
    const total = round2((chosen?.price || 0) * q)
    breakdown.push({
      tier_from: chosen?.start || 1,
      tier_to: chosen?.end ?? null,
      units: q,
      unit_price: chosen?.price || 0,
      subtotal: total
    })
    return { total, breakdown }
  }

  // graduated / stairstep
  let remaining = q
  for (const t of norm) {
    if (remaining <= 0) break
    const bandStart = t.start
    const bandEnd = t.end ?? (bandStart + remaining - 1)
    const bandSize = (bandEnd - bandStart + 1)
    const alloc = Math.max(0, Math.min(remaining, bandSize))
    if (alloc > 0) {
      const sub = round2(alloc * (t.price || 0))
      breakdown.push({
        tier_from: bandStart,
        tier_to: t.end ?? null,
        units: alloc,
        unit_price: t.price || 0,
        subtotal: sub
      })
      remaining -= alloc
    }
  }
  const total = round2(breakdown.reduce((s, b) => s + b.subtotal, 0))
  return { total, breakdown }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}