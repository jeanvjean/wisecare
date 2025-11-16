// @ts-nocheck
const CHARGEBEE_SITE = Deno.env.get('CHARGEBEE_SITE') || 'enyata-test'
const CHARGEBEE_API_KEY = Deno.env.get('CHARGEBEE_API_KEY') || 'test_WDOffoOLVp4VmsweeaBcdSlcureDbvGoAF'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  try {
    const { itemPriceId, itemId, customerId, customerEmail, firstName, lastName, redirectUrl, quantity, quantityDecimal } = await req.json()

    // Determine the correct Product Catalog 2.0 item_price_id
    let priceId = itemPriceId || null

    // If only itemId is provided, try to resolve its first active item_price_id
    if (!priceId && itemId) {
      try {
        const lookupUrl = `https://${CHARGEBEE_SITE}.chargebee.com/api/v2/item_prices?item_id[is]=${encodeURIComponent(itemId)}&limit=1`
        const lookupRes = await fetch(lookupUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
            'Content-Type': 'application/json'
          }
        })
        if (lookupRes.ok) {
          const lookupData = await lookupRes.json()
          priceId = lookupData.list?.[0]?.item_price?.id || null
        } else {
          const lt = await lookupRes.text()
          console.error('Chargebee item_price lookup failed:', lookupRes.status, lt)
        }
      } catch (e) {
        console.error('Chargebee item_price lookup exception:', e)
      }
    }

    if (!priceId) {
      return new Response(JSON.stringify({
        error: 'Missing item_price_id',
        details: 'Provide itemPriceId directly or a valid itemId that has at least one item_price'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // Validate that the selected item_price_id is a PLAN (PC 2.0 requires at least one plan item)
    try {
      const priceDetailRes = await fetch(`https://${CHARGEBEE_SITE}.chargebee.com/api/v2/item_prices/${encodeURIComponent(priceId)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
          'Accept': 'application/json'
        }
      })
      if (!priceDetailRes.ok) {
        const t = await priceDetailRes.text()
        console.error('Chargebee item_price detail fetch failed:', priceDetailRes.status, t)
        return new Response(JSON.stringify({
          error: 'Invalid item_price_id',
          details: 'Unable to fetch item price details from Chargebee',
          upstream_status: priceDetailRes.status,
          upstream_body: t
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }
      const priceDetail = await priceDetailRes.json()
      const ip = priceDetail.item_price
      const itemType = ip?.item_type
      const itemStatus = ip?.status
      if (itemType !== 'plan') {
        return new Response(JSON.stringify({
          error: 'Selected item is not a plan',
          details: 'Checkout requires at least one plan item. Please select a plan, not an addon or charge.',
          item_price_id: priceId,
          item_type: itemType
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }
      if (itemStatus !== 'active') {
        return new Response(JSON.stringify({
          error: 'Selected plan is not active',
          details: 'Please select an active plan item price.',
          item_price_id: priceId,
          item_status: itemStatus
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }
    } catch (e) {
      console.error('Chargebee item_price validation exception:', e)
      return new Response(JSON.stringify({
        error: 'Validation error',
        details: 'Failed to validate item_price_id against Chargebee'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    console.log('Creating hosted page for:', { itemPriceId: priceId, customerId, customerEmail })

    // Create hosted page for Product Catalog 2.0 subscription checkout
    // Resolve checkout quantity (Chargebee supports quantity and quantity_in_decimal in PC 2.0)
    let useDecimalQty = false
    let qtyString = '1'
    if (typeof quantityDecimal === 'string' && quantityDecimal.trim() !== '') {
      useDecimalQty = true
      qtyString = quantityDecimal.trim()
    } else if (typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0) {
      qtyString = String(Math.floor(quantity))
    }

    // Build params explicitly to avoid sending undefined values
    const params = new URLSearchParams()
    params.set('subscription_items[item_price_id][0]', priceId)
    if (useDecimalQty) {
      params.set('subscription_items[quantity_in_decimal][0]', qtyString)
    } else {
      params.set('subscription_items[quantity][0]', qtyString)
    }
    // Map Chargebee customer to Supabase user id so webhook can map back reliably
    if (customerId) params.set('customer[id]', customerId)
    if (customerEmail) params.set('customer[email]', customerEmail)
    if (firstName) params.set('customer[first_name]', firstName)
    if (lastName) params.set('customer[last_name]', lastName)
    // Always provide redirect and cancel URLs. Chargebee validates these and the domain must be allowed.
    // We force both to use the request origin to avoid invalid/relative URLs being sent from the client.
    const requestOrigin = req.headers.get('origin') || null

    // If client provided an absolute redirectUrl, prefer its origin, otherwise use request origin
    let computedOrigin: string | null = null
    try {
      if (redirectUrl) {
        const u = new URL(redirectUrl)
        computedOrigin = u.origin
      }
    } catch {
      // ignore invalid client value
    }
    if (!computedOrigin) {
      computedOrigin = requestOrigin
    }

    if (!computedOrigin) {
      return new Response(JSON.stringify({
        error: 'Missing valid origin for redirect_url',
        details: 'The request must include a valid Origin header or an absolute redirectUrl',
        hint: 'Ensure your app domain (e.g. https://5f601aa89bbf.ngrok-free.app) is in Chargebee Allowed Domains'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    const finalRedirect = `${computedOrigin}/checkout-success`
    const finalCancel = `${computedOrigin}/plans`
    params.set('redirect_url', finalRedirect)
    params.set('cancel_url', finalCancel)

    const response = await fetch(`https://${CHARGEBEE_SITE}.chargebee.com/api/v2/hosted_pages/checkout_new_for_items`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(CHARGEBEE_API_KEY + ':')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    })

    console.log('Chargebee hosted page response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Chargebee hosted page error:', response.status, errorText)

      // Build a debug payload with the exact params we sent (redact customer email slightly)
      const debugParams = {
        item_price_id: priceId,
        ...(useDecimalQty ? { quantity_in_decimal: qtyString } : { quantity: qtyString }),
        customer_email_redacted: customerEmail ? `${customerEmail.slice(0,3)}***@***` : undefined,
        customer_first_name_present: !!firstName,
        customer_last_name_present: !!lastName,
        redirect_url: finalRedirect,
        cancel_url: finalCancel
      }

      // Return JSON that includes Chargebee error body and our sent params for faster root-cause analysis
      return new Response(JSON.stringify({
        error: 'Chargebee API error',
        status: response.status,
        chargebee_body: (() => {
          try { return JSON.parse(errorText) } catch { return errorText }
        })(),
        params_sent: debugParams
      }), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    const data = await response.json()
    console.log('Hosted page created successfully')

    return new Response(JSON.stringify({
      hostedPageUrl: data.hosted_page.url,
      hostedPageId: data.hosted_page.id
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    })
  } catch (error) {
    console.error('Error creating hosted page:', error)
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