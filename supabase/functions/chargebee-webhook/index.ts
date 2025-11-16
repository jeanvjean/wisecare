// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface ChargebeeWebhookEvent {
  event_type: string
  content: {
    subscription?: {
      id: string
      customer_id: string
      plan_id: string
      status: string
      current_term_start: number
      current_term_end: number
      billing_period_unit: string
    }
    customer?: {
      id: string
      email: string
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const event: ChargebeeWebhookEvent = await req.json()

    console.log('Received webhook event:', event.event_type)
  
    switch (event.event_type) {
      case 'subscription_created':
      case 'subscription_activated':
        await handleSubscriptionActivated(event)
        break
      case 'subscription_reactivated':
      case 'subscription_renewed':
        await handleSubscriptionReactivated(event)
        break
      case 'subscription_cancelled':
        await handleSubscriptionCancelled(event)
        break
      default:
        console.log('Unhandled event type:', event.event_type)
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response('Internal server error', { status: 500 })
  }
})

async function handleSubscriptionActivated(event: ChargebeeWebhookEvent) {
  const subscription = event.content.subscription
  if (!subscription) return

  // Resolve the Supabase user id for this subscription
  // Prefer Chargebee customer_id if it looks like a UUID (we set this during checkout for new subscriptions)
  let resolvedUserId: string | null = subscription.customer_id || null

  const looksLikeUUID = (v?: string) =>
    !!v && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v)

  // If customer_id is not a UUID (e.g. Chargebee native id like "cb_..."), fallback to mapping by email
  if (!looksLikeUUID(resolvedUserId)) {
    const email = event.content.customer?.email
    if (email) {
      try {
        // Use Admin API (service role key) to find the user by email
        const { data, error } = await (supabase as any).auth.admin.listUsers({ page: 1, perPage: 1000 })
        if (error) {
          console.error('Auth admin listUsers error:', error)
        } else {
          const users: any[] = data?.users || []
          const match = users.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase())
          if (match?.id) {
            resolvedUserId = match.id
          }
        }
      } catch (e) {
        console.error('Auth admin lookup exception:', e)
      }
    }
  }

  if (!looksLikeUUID(resolvedUserId)) {
    // Cannot safely persist due to FK to auth.users; log and skip
    console.warn('Skipping subscription upsert: could not resolve Supabase user id for webhook event', {
      chargebee_customer_id: subscription.customer_id,
      customer_email_present: !!event.content.customer?.email
    })
    return
  }

  const record = {
    user_id: resolvedUserId,
    chargebee_subscription_id: subscription.id,
    status: subscription.status,
    current_period_start: new Date(subscription.current_term_start * 1000),
    current_period_end: new Date(subscription.current_term_end * 1000),
    payment_frequency: subscription.billing_period_unit
  }
  // Upsert the subscription and return the row so we can link dependents
  const { data: subData, error: upsertErr } = await supabase
    .from('subscriptions')
    .upsert(record, { onConflict: 'chargebee_subscription_id' })
    .select('*')
    .single()

  if (upsertErr) {
    console.error('Error updating subscription:', upsertErr, { record })
    return
  }

  const localSubId = subData?.id
  if (!localSubId) {
    console.warn('Upsert returned no subscription id, skipping dependent linking', { subData })
    return
  }

  // Link any dependents for this user that were created before subscription (subscription_id IS NULL)
  try {
    const { error: depErr } = await supabase
      .from('dependents')
      .update({ subscription_id: localSubId })
      .eq('user_id', resolvedUserId)
      .is('subscription_id', null)

    if (depErr) {
      console.error('Failed to link dependents to new subscription:', depErr)
    } else {
      console.log('Linked dependents to subscription', { user_id: resolvedUserId, subscription_id: localSubId })
    }
  } catch (e) {
    console.error('Exception while linking dependents:', e)
  }

  // Mark plan as selected in user metadata and set active/ever_had flags
  try {
    // Also update has_ever_had_subscription only if not already true
    const { data: currentUser, error: getUserErr } = await supabase.auth.admin.getUserById(resolvedUserId)
    const existingMeta = currentUser?.user_metadata || {}
    await supabase.auth.admin.updateUserById(resolvedUserId, {
      user_metadata: {
        ...existingMeta,
        plan_selected: true,
        plan_id: subscription.plan_id,
        subscription_id: subscription.id,
        has_active_subscription: true,
        has_ever_had_subscription: existingMeta.has_ever_had_subscription ? true : true
      }
    })
    console.log('Marked plan as selected and flagged active subscription for user:', resolvedUserId)
  } catch (e) {
    console.error('Exception while updating user metadata:', e)
  }
}

async function handleSubscriptionCancelled(event: ChargebeeWebhookEvent) {
  const subscription = event.content.subscription
  if (!subscription) return

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'cancelled' })
    .eq('chargebee_subscription_id', subscription.id)

  if (error) {
    console.error('Error cancelling subscription:', error)
  }
}

async function handleSubscriptionReactivated(event: ChargebeeWebhookEvent) {
  const subscription = event.content.subscription
  if (!subscription) return

  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      chargebee_subscription_id: subscription.id,
      status: 'active',
      current_period_start: new Date(subscription.current_term_start * 1000),
      current_period_end: new Date(subscription.current_term_end * 1000)
    }, { onConflict: 'chargebee_subscription_id' })

  if (error) {
    console.error('Error reactivating/renewing subscription:', error)
  }
}