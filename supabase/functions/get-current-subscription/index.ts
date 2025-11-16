// @ts-nocheck
// Returns the user's current Chargebee subscription summary with plan (item price) details
// Query: GET ?customerId={supabase_user_id}
//
// Response:
// {
//   "subscription_id": "xxxx",
//   "status": "active",
//   "current_period_start": "2025-09-01T00:00:00.000Z",
//   "current_period_end": "2025-10-01T00:00:00.000Z",
//   "item_price_id": "plan_monthly_001",
//   "plan_name": "Gold Plan Monthly",
//   "price": 29.99,
//   "currency": "USD",
//   "billing_period": 1,
//   "billing_period_unit": "month"
// }

const CHARGEBEE_SITE = Deno.env.get('CHARGEBEE_SITE') || 'enyata-test'
const CHARGEBEE_API_KEY = Deno.env.get('CHARGEBEE_API_KEY') || 'test_WDOffoOLVp4VmsweeaBcdSlcureDbvGoAF'

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
    const url = new URL(req.url)
    const customerIdParam = url.searchParams.get('customerId') || url.searchParams.get('userId')
    const emailParam = url.searchParams.get('email')
    if (!customerIdParam && !emailParam) {
      return new Response(JSON.stringify({
        error: 'Missing parameter',
        details: 'Provide customerId (preferred) or email'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // 1) Try by Chargebee customer_id first (descending by created_at)
    let first: any = null

    if (customerIdParam) {
      const listUrl = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions?customer_id[is]=${encodeURIComponent(customerIdParam)}&sort_by[desc]=created_at&limit=1`
      const listRes = await fetch(listUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
          'Accept': 'application/json'
        }
      })
      if (!listRes.ok) {
        const text = await listRes.text()
        return new Response(JSON.stringify({
          error: 'Upstream error (list subscriptions by customer_id)',
          upstream_status: listRes.status,
          upstream_body: tryParse(text)
        }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }
      const listPayload = await listRes.json()
      first = (listPayload.list || [])[0]
    }

    // 1b) Fallback by email → find customer then list subscriptions
    if ((!first || !first.subscription) && emailParam) {
      // find customer by email
      const findCustUrl = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/customers?email[is]=${encodeURIComponent(emailParam)}&limit=1`
      const custRes = await fetch(findCustUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
          'Accept': 'application/json'
        }
      })
      if (!custRes.ok) {
        const text = await custRes.text()
        return new Response(JSON.stringify({
          error: 'Upstream error (find customer by email)',
          upstream_status: custRes.status,
          upstream_body: tryParse(text)
        }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }
      const custPayload = await custRes.json()
      const customerIdFound = (custPayload.list || [])[0]?.customer?.id

      if (customerIdFound) {
        const listUrlByEmail = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions?customer_id[is]=${encodeURIComponent(customerIdFound)}&sort_by[desc]=created_at&limit=1`
        const listRes2 = await fetch(listUrlByEmail, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
            'Accept': 'application/json'
          }
        })
        if (!listRes2.ok) {
          const text = await listRes2.text()
          return new Response(JSON.stringify({
            error: 'Upstream error (list subscriptions by email)',
            upstream_status: listRes2.status,
            upstream_body: tryParse(text)
          }), {
            status: 502,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          })
        }
        const listPayload2 = await listRes2.json()
        first = (listPayload2.list || [])[0]
      }
    }

    if (!first || !first.subscription) {
      // No subscriptions for this user/email
      return new Response(JSON.stringify({
        subscription: null
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    const sub = first.subscription
    const subscriptionId = sub.id

    // 2) Fetch subscription details with subscription items embedded (PC 2.0)
    const subDetailUrl = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions/${encodeURIComponent(subscriptionId)}?embed[]=subscription_items`
    const subDetailRes = await fetch(subDetailUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
        'Accept': 'application/json'
      }
    })

    if (!subDetailRes.ok) {
      const text = await subDetailRes.text()
      return new Response(JSON.stringify({
        error: 'Upstream error (subscription detail)',
        upstream_status: subDetailRes.status,
        upstream_body: tryParse(text)
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    const subDetailPayload = await subDetailRes.json()
    const subDetail = subDetailPayload.subscription || {}
    const items = subDetail.subscription_items || []

    // pick the first plan item_price_id (ignore addons)
    let activePlanItemPriceId: string | null = null
    for (const it of items) {
      // In PC 2.0, subscription_items entries contain "item_type" and "item_price_id"
      const itemType = it.item_type || it.item?.type
      const priceId = it.item_price_id || it.item_price?.id
      if (itemType === 'plan' && priceId) {
        activePlanItemPriceId = priceId
        break
      }
    }

    if (!activePlanItemPriceId) {
      // No plan item in subscription (could be addon-only)
      return new Response(JSON.stringify({
        subscription_id: subscriptionId,
        status: subDetail.status,
        current_period_start: toIso(subDetail.current_term_start),
        current_period_end: toIso(subDetail.current_term_end),
        item_price_id: null,
        plan_name: null,
        price: null,
        currency: null,
        billing_period: null,
        billing_period_unit: null
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // 3) Fetch item_price details to display friendly plan name and price
    const priceRes = await fetch(`https://${CHARGEBEE_SITE}.chargebee.com/api/v2/item_prices/${encodeURIComponent(activePlanItemPriceId)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
        'Accept': 'application/json'
      }
    })

    if (!priceRes.ok) {
      const text = await priceRes.text()
      return new Response(JSON.stringify({
        error: 'Upstream error (item_price detail)',
        upstream_status: priceRes.status,
        upstream_body: tryParse(text),
        item_price_id: activePlanItemPriceId
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    const pricePayload = await priceRes.json()
    const ip = pricePayload.item_price || {}

    // Resolve quantity from the active plan item in subscription_items
    let quantity: number = 1
    for (const it of items) {
      const itemType = it.item_type || it.item?.type
      const priceId = it.item_price_id || it.item_price?.id
      if (itemType === 'plan' && priceId === activePlanItemPriceId) {
        if (typeof it.quantity_in_decimal === 'string' && it.quantity_in_decimal.trim() !== '') {
          quantity = parseFloat(it.quantity_in_decimal)
        } else if (typeof it.quantity === 'number') {
          quantity = it.quantity
        }
        break
      }
    }

    // Compute pricing (supports per_unit, volume, graduated/stairstep)
    const pricing_mode = (ip.tiers_mode || ip.pricing_model || 'per_unit').toLowerCase()
    const unit_price = getUnitPriceDecimal(ip) // decimal number
    const tiers = Array.isArray(ip.tiers) ? ip.tiers : []
    const { total: computed_total, breakdown } = computeTotalForQuantity({
      mode: pricing_mode,
      tiers,
      unit_price,
      quantity
    })

    const result = {
      subscription_id: subscriptionId,
      status: subDetail.status,
      current_period_start: toIso(subDetail.current_term_start),
      current_period_end: toIso(subDetail.current_term_end),
      item_price_id: activePlanItemPriceId,
      plan_name: ip.name || ip.item_id || activePlanItemPriceId,
      price: unit_price, // unit price (decimal) as configured for the plan
      currency: ip.currency_code || null,
      billing_period: ip.period || null,
      billing_period_unit: (ip.period_unit || '').toLowerCase() || null,
      // quantity/tiered pricing additions
      quantity,
      pricing_mode,
      computed_total,
      breakdown
    }

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    })
  } catch (error) {
    console.error('get-current-subscription error:', error)
    const details = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details,
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

function tryParse(text: string) {
  try { return JSON.parse(text) } catch { return text }
}

function toIso(epochSeconds?: number) {
  if (!epochSeconds || typeof epochSeconds !== 'number') return null
  return new Date(epochSeconds * 1000).toISOString()
}

// Helpers for tiered pricing computation

function toDecimal(val?: any): number | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'string') {
    const f = parseFloat(val)
    return Number.isFinite(f) ? f : null
  }
  if (typeof val === 'number') {
    // Chargebee minor units fallback (price integer in cents)
    return val / 100
  }
  return null
}

function getUnitPriceDecimal(ip: any): number | null {
  // Prefer explicit decimal, fallback to minor units
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
  mode: string,
  tiers: any[],
  unit_price: number | null,
  quantity: number
}): { total: number | null, breakdown: Array<{ tier_from: number, tier_to: number | null, units: number, unit_price: number, subtotal: number }> } {
  const { mode, tiers, unit_price, quantity } = args
  const q = Math.max(0, Math.floor(quantity || 0))
  const breakdown: Array<{ tier_from: number, tier_to: number | null, units: number, unit_price: number, subtotal: number }> = []

  // No tiers or per_unit pricing -> simple multiplication
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

  // Normalize tiers: ensure numbers and sorted by starting unit
  const norm = tiers.map((t: any) => {
    const start = Number(t.starting_unit || t.start_unit || t.from || 1)
    const endRaw = t.ending_unit ?? t.end_unit ?? t.to ?? null
    const end = endRaw === null || endRaw === undefined ? null : Number(endRaw)
    const tierUnitPrice = toDecimal(t.price_in_decimal) ?? toDecimal(t.price) ?? unit_price ?? 0
    return { start, end, price: tierUnitPrice }
  }).sort((a, b) => a.start - b.start)

  const m = mode.toLowerCase()

  if (m === 'volume') {
    // Find the tier covering the total quantity
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

  // graduated / stairstep: allocate across ranges
  let remaining = q
  for (const t of norm) {
    if (remaining <= 0) break
    const bandStart = t.start
    const bandEnd = t.end ?? (bandStart + remaining - 1) // open-ended
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