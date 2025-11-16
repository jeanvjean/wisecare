import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { supabase } from '../lib/supabase'

type Invoice = {
  id: string
  subscription_id: string | null
  status: string
  amount_paid: number
  amount_due: number
  currency_code: string
  date: number
  paid_at: number | null
  due_date: number | null
  line_items: {
    entity_type: string
    entity_id: string
    date_from: number | null
    date_to: number | null
    unit_amount: number
    quantity: number
  }[]
}

type SubscriptionSummary = {
  id: string
  status: string
  current_term_start: number | null
  current_term_end: number | null
  billing_period_unit: string | null
  plan_item_price_id: string | null
}

function centsToMoney(amount?: number, currency?: string) {
  if (typeof amount !== 'number') return '—'
  const value = amount / 100
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency || 'USD'}`
  }
}

function epochToDate(epoch?: number | null) {
  if (!epoch) return '—'
  return new Date(epoch * 1000).toLocaleDateString()
}

function Billing() {
  const { user } = useAuthStore()
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  // Get billing history from Edge Function (invoices + subscriptions from Chargebee)
  const { data: billingData, isLoading, error } = useQuery({
    queryKey: ['billing-history', user?.id],
    queryFn: async () => {
      if (!user) return null
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-billing-history?customerId=${user.id}`
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`
        }
      })
      if (!response.ok) {
        const text = await response.text()
        console.error('get-billing-history error:', response.status, text)
        throw new Error('Failed to fetch billing history')
      }
      return await response.json() as {
        customer_id: string | null
        invoices: Invoice[]
        subscriptions: SubscriptionSummary[]
      }
    },
    enabled: !!user
  })

  // Fetch local subscriptions for mapping CB sub id -> local subscription row id (for dependents count)
  const { data: localSubs } = useQuery({
    queryKey: ['local-subs', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id, chargebee_subscription_id, status, current_period_start, current_period_end')
        .eq('user_id', user.id)
      if (error) throw error
      return data as { id: string; chargebee_subscription_id: string | null; status: string; current_period_start: string | null; current_period_end: string | null }[]
    },
    enabled: !!user
  })

  // Pre-load dependents count per local subscription id to avoid N+1
  const localSubIds = useMemo(() => (localSubs || []).map(s => s.id), [localSubs])

  const { data: dependentsCounts } = useQuery({
    queryKey: ['dependents-count-by-sub', user?.id, localSubIds.sort().join(',')],
    queryFn: async () => {
      if (!user || localSubIds.length === 0) return {}
      // Fetch dependents grouped by subscription_id
      const { data, error } = await supabase
        .from('dependents')
        .select('subscription_id')
        .eq('user_id', user.id)
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of data as { subscription_id: string | null }[]) {
        if (row.subscription_id) {
          counts[row.subscription_id] = (counts[row.subscription_id] || 0) + 1
        }
      }
      return counts
    },
    enabled: !!user && localSubIds.length > 0
  })

  // Map CB subscription id -> dependents count via local subscriptions linkage
  const cbSubDependentsCount = useMemo(() => {
    const map: Record<string, number> = {}
    if (!localSubs || !dependentsCounts) return map
    for (const s of localSubs) {
      if (s.chargebee_subscription_id) {
        const count = dependentsCounts[s.id] || 0
        map[s.chargebee_subscription_id] = count
      }
    }
    return map
  }, [localSubs, dependentsCounts])

  const subscriptionsIndex = useMemo(() => {
    const idx: Record<string, SubscriptionSummary> = {}
    for (const s of billingData?.subscriptions || []) {
      idx[s.id] = s
    }
    return idx
  }, [billingData])

  const invoices = billingData?.invoices || []

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading billing history...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Failed to load billing history.</p>
          <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-4 py-2 rounded">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Billing History</h1>
          <p className="text-gray-600 mt-1">View all payments, terms, and plan details.</p>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-4 border-b">
            <h2 className="text-lg font-semibold">Invoices</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount Paid</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Term</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dependents (at subscription)</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoices.map((inv) => {
                  const sub = inv.subscription_id ? subscriptionsIndex[inv.subscription_id] : undefined
                  const line = inv.line_items?.find(li => li.entity_type === 'item_price') || null
                  const from = line?.date_from
                  const to = line?.date_to
                  const depCount = inv.subscription_id ? (cbSubDependentsCount[inv.subscription_id] || 0) : 0
                  return (
                    <tr key={inv.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{inv.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{epochToDate(inv.date)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${inv.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {centsToMoney(inv.amount_paid, inv.currency_code)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {from ? epochToDate(from) : '—'} — {to ? epochToDate(to) : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{depCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">No invoices found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Details Drawer/Modal */}
        {selectedInvoice && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
              <div className="px-6 py-4 border-b flex items-center justify-between">
                <h3 className="text-lg font-semibold">Invoice Details - {selectedInvoice.id}</h3>
                <button className="text-gray-500 hover:text-gray-700" onClick={() => setSelectedInvoice(null)}>Close</button>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">Status</div>
                    <div className="font-medium">{selectedInvoice.status}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Date</div>
                    <div className="font-medium">{epochToDate(selectedInvoice.date)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Amount Paid</div>
                    <div className="font-medium">
                      {centsToMoney(selectedInvoice.amount_paid, selectedInvoice.currency_code)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Amount Due</div>
                    <div className="font-medium">
                      {centsToMoney(selectedInvoice.amount_due, selectedInvoice.currency_code)}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-gray-700 font-semibold mb-2">Line Items</div>
                  <div className="border rounded">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item/Price ID</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">From</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">To</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedInvoice.line_items.map((li, idx) => (
                          <tr key={idx} className="text-sm">
                            <td className="px-4 py-2">{li.entity_type}</td>
                            <td className="px-4 py-2">{li.entity_id}</td>
                            <td className="px-4 py-2">{li.date_from ? epochToDate(li.date_from) : '—'}</td>
                            <td className="px-4 py-2">{li.date_to ? epochToDate(li.date_to) : '—'}</td>
                            <td className="px-4 py-2">{centsToMoney(li.unit_amount, selectedInvoice.currency_code)}</td>
                            <td className="px-4 py-2">{li.quantity}</td>
                          </tr>
                        ))}
                        {selectedInvoice.line_items.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-6 text-center text-gray-500">No line items</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedInvoice.subscription_id && (
                  <div className="text-sm">
                    <div className="text-gray-700 font-semibold mb-1">Subscription</div>
                    <div className="text-gray-600">ID: {selectedInvoice.subscription_id}</div>
                    <div className="text-gray-600">
                      Dependents linked at present: {cbSubDependentsCount[selectedInvoice.subscription_id] || 0}
                    </div>
                    <div className="text-gray-500 text-xs mt-1">
                      Note: dependent count reflects the current linkage to this subscription.
                    </div>
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t text-right">
                <button onClick={() => setSelectedInvoice(null)} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default Billing