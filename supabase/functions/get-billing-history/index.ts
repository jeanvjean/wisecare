// @ts-nocheck
// Returns billing history (invoices) and subscriptions summary for a customer.
// Query (any one is sufficient):
//   GET ?customerId={supabase_user_id}
//   GET ?email={customer_email}
//
// Response:
// {
//   "customer_id": "cb_... or supabase uuid if set",
//   "invoices": [{
//     "id": "inv_xxx",
//     "subscription_id": "sub_xxx",
//     "status": "paid",
//     "amount_paid": 2999,              // minor units (cents)
//     "amount_due": 0,                  // minor units
//     "currency_code": "USD",
//     "date": 1727481600,               // epoch seconds
//     "paid_at": 1727485200,            // epoch seconds or null
//     "due_date": 1727485200,           // epoch seconds or null
//     "line_items": [{
//        "entity_type": "item_price",
//        "entity_id": "plan_monthly_gold",
//        "date_from": 1727481600,       // epoch seconds (if present)
//        "date_to": 1729987200          // epoch seconds (if present)
//     }]
//   }, ...],
//   "subscriptions": [{
//     "subscription_id": "sub_xxx",
//     "status": "active",
//     "current_period_start": "2025-09-01T00:00:00.000Z",
//     "current_period_end": "2025-10-01T00:00:00.000Z",
//     "item_price_id": "plan_monthly_gold",
//     "plan_name": "Gold Plan Monthly",
//     "price": 29.99,
//     "currency": "USD",
//     "billing_period": 1,
//     "billing_period_unit": "month"
//   }]
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

    // Resolve Chargebee customer id
    let chargebeeCustomerId: string | null = null

    if (customerIdParam) {
      // First try listing subscriptions by provided id to validate mapping
      const testUrl = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions?customer_id[is]=${encodeURIComponent(customerIdParam)}&limit=1`
      const testRes = await cbGet(testUrl)
      if (testRes.ok) {
        const first = (testRes.payload.list || [])[0]
        if (first?.subscription?.customer_id) {
          chargebeeCustomerId = first.subscription.customer_id
        }
      }
    }

    // Fallback: find a customer by email
    if (!chargebeeCustomerId && emailParam) {
      const custRes = await cbGet(`https://${CHARGEBEE_SITE}.chargebee.com/api/v2/customers?email[is]=${encodeURIComponent(emailParam)}&limit=1`)
      if (!custRes.ok) {
        return upstreamError('find customer by email', custRes.status, custRes.errorText)
      }
      chargebeeCustomerId = (custRes.payload.list || [])[0]?.customer?.id || null
    }

    if (!chargebeeCustomerId && customerIdParam) {
      // Last resort: assume provided id is accepted by Chargebee APIs
      chargebeeCustomerId = customerIdParam
    }

    if (!chargebeeCustomerId) {
      return new Response(JSON.stringify({
        customer_id: null,
        invoices: [],
        subscriptions: []
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // Fetch invoices (paginate)
    const invoices: any[] = []
    let inv_offset: string | null = null
    let page = 1
    do {
      const invUrl = inv_offset
        ? `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/invoices?customer_id[is]=${encodeURIComponent(chargebeeCustomerId)}&sort_by[desc]=date&limit=100&offset=${encodeURIComponent(inv_offset)}`
        : `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/invoices?customer_id[is]=${encodeURIComponent(chargebeeCustomerId)}&sort_by[desc]=date&limit=100`
      const invRes = await cbGet(invUrl)
      if (!invRes.ok) {
        return upstreamError('list invoices', invRes.status, invRes.errorText)
      }
      const lp = invRes.payload
      const list = lp.list || []
      for (const it of list) {
        const inv = it.invoice
        invoices.push({
          id: inv.id,
          subscription_id: inv.subscription_id || null,
          status: inv.status,
          amount_paid: inv.amount_paid,
          amount_due: inv.amount_due,
          currency_code: inv.currency_code,
          date: inv.date,
          paid_at: inv.paid_at || null,
          due_date: inv.due_date || null,
          line_items: (inv.line_items || []).map((li: any) => ({
            entity_type: li.entity_type,
            entity_id: li.entity_id,
            date_from: li.date_from || null,
            date_to: li.date_to || null,
            unit_amount: li.unit_amount,
            quantity: li.quantity
          }))
        })
      }
      inv_offset = lp.next_offset || null
      page += 1
    } while (inv_offset)

    // Fetch subscriptions summary (paginate)
    const subscriptions: any[] = []
    let sub_offset: string | null = null
    page = 1
    do {
      const subUrl = sub_offset
        ? `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions?customer_id[is]=${encodeURIComponent(chargebeeCustomerId)}&sort_by[desc]=created_at&limit=100&offset=${encodeURIComponent(sub_offset)}`
        : `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions?customer_id[is]=${encodeURIComponent(chargebeeCustomerId)}&sort_by[desc]=created_at&limit=100`
      const subRes = await cbGet(subUrl)
      if (!subRes.ok) {
        return upstreamError('list subscriptions', subRes.status, subRes.errorText)
      }
      const lp = subRes.payload
      const list = lp.list || []
      for (const it of list) {
        const sub = it.subscription

        // Always fetch subscription detail with subscription_items to get accurate quantity
        const subDetailRes = await cbGet(`https://${CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions/${encodeURIComponent(sub.id)}?embed[]=subscription_items`)
        let subItems: any[] = []
        if (subDetailRes.ok) {
          const sd = subDetailRes.payload.subscription || {}
          subItems = Array.isArray(sd.subscription_items) ? sd.subscription_items : []
        }

        // Resolve primary plan item_price_id and quantity from embedded items
        let planItemPriceId: string | null = null
        let quantity: number = 1
        for (const si of subItems) {
          const itemType = si.item_type || si.item?.type
          const priceId = si.item_price_id || si.item_price?.id
          if (itemType === 'plan' && priceId) {
            planItemPriceId = priceId
            if (typeof si.quantity_in_decimal === 'string' && si.quantity_in_decimal.trim() !== '') {
              quantity = parseFloat(si.quantity_in_decimal)
            } else if (typeof si.quantity === 'number') {
              quantity = si.quantity
            }
            break
          }
        }

        // Fetch item_price details to compute pricing (tiers, unit price, etc.)
        let planName: string | null = null
        let unitPrice: number | null = null
        let currency: string | null = null
        let billingPeriod: number | null = null
        let billingPeriodUnit: string | null = null
        let pricingMode: string | null = null
        let computedTotal: number | null = null
        let breakdown: Array<{ tier_from: number, tier_to: number | null, units: number, unit_price: number, subtotal: number }> = []

        if (planItemPriceId) {
          const priceRes = await cbGet(`https://${CHARGEBEE_SITE}.chargebee.com/api/v2/item_prices/${encodeURIComponent(planItemPriceId)}`)
          if (priceRes.ok) {
            const ip = priceRes.payload.item_price || {}
            planName = ip.name || ip.item_id || planItemPriceId
            unitPrice = getUnitPriceDecimal(ip)
            currency = ip.currency_code || null
            billingPeriod = ip.period || null
            billingPeriodUnit = (ip.period_unit || '').toLowerCase() || null

            pricingMode = (ip.tiers_mode || ip.pricing_model || 'per_unit').toLowerCase()
            const tiers = Array.isArray(ip.tiers) ? ip.tiers : []
            const comp = computeTotalForQuantity({
              mode: pricingMode,
              tiers,
              unit_price: unitPrice,
              quantity
            })
            computedTotal = comp.total
            breakdown = comp.breakdown
          }
        }

        subscriptions.push({
          subscription_id: sub.id,
          status: sub.status,
          current_period_start: toIso(sub.current_term_start),
          current_period_end: toIso(sub.current_term_end),
          item_price_id: planItemPriceId,
          plan_name: planName,
          // unit price as decimal in currency's major units
          price: unitPrice,
          currency: currency,
          billing_period: billingPeriod,
          billing_period_unit: billingPeriodUnit,
          // quantity/tiered pricing additions
          quantity,
          pricing_mode: pricingMode,
          computed_total: computedTotal,
          breakdown
        })
      }
      sub_offset = lp.next_offset || null
      page += 1
    } while (sub_offset)

    return new Response(JSON.stringify({
      customer_id: chargebeeCustomerId,
      invoices,
      subscriptions
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    })
  } catch (error) {
    console.error('get-billing-history error:', error)
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

async function cbGet(url: string): Promise<{ ok: boolean, status: number, payload?: any, errorText?: string }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
      'Accept': 'application/json'
    }
  })
  if (!res.ok) {
    const text = await res.text()
    return { ok: false, status: res.status, errorText: text }
  }
  const payload = await res.json()
  return { ok: true, status: 200, payload }
}

function upstreamError(where: string, status: number, text?: string) {
  return new Response(JSON.stringify({
    error: `Upstream error (${where})`,
    upstream_status: status,
    upstream_body: tryParse(text || '')
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

function tryParse(text: string) {
  try { return JSON.parse(text) } catch { return text }
}

function toIso(epochSeconds?: number) {
  if (!epochSeconds || typeof epochSeconds !== 'number') return null
  return new Date(epochSeconds * 1000).toISOString()
}

// Helpers for tiered pricing computation (shared approach with get-current-subscription)

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