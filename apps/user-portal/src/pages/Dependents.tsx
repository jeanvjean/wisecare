import React, { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '../store/auth'
import { supabase } from '../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

const dependentSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  relationship: z.string().min(1, 'Relationship is required'),
  phone_number: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  date_of_birth: z.string().min(1, 'Date of birth is required')
})

type DependentForm = z.infer<typeof dependentSchema>

function Dependents() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [fullNameError, setFullNameError] = useState<string | null>(null)

  // Open Add Dependent form when navigated with ?add=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('add') === '1') {
      setShowAddForm(true)
    }
  }, [])

  // Fetch existing dependents
  const { data: dependents, isLoading } = useQuery({
    queryKey: ['dependents', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('dependents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!user
  })

  // Fetch available plans (for potential UI needs)
  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
      if (error) throw error
      return data
    }
  })

  // Fetch onboarding cap for number of loved ones
  const { data: onboardingCap } = useQuery({
    queryKey: ['onboarding-cap', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('user_onboarding')
        .select('number_of_loved_ones')
        .eq('user_id', user.id)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return data
    },
    enabled: !!user
  })

  // Fetch active subscription
  const { data: activeSubscription } = useQuery({
    queryKey: ['active-subscription', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id,status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return data
    },
    enabled: !!user
  })
// Fetch current Chargebee subscription (source of truth) via Edge Function
const { data: cbCurrent } = useQuery({
  queryKey: ['active-subscription-cb', user?.id],
  queryFn: async () => {
    if (!user) return null
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-current-subscription?customerId=${user.id}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`
      }
    })
    if (!response.ok) {
      const text = await response.text()
      console.error('get-current-subscription error:', response.status, text)
      return null
    }
    return await response.json()
  },
  enabled: !!user,
  staleTime: 60 * 1000
})

  // Fetch user's local subscriptions to determine per-dependent delete eligibility
  const { data: userSubscriptions = [] } = useQuery({
    queryKey: ['user-subscriptions', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id,status,current_period_end')
        .eq('user_id', user.id)
      if (error) throw error
      return data as { id: string; status: string; current_period_end: string | null }[]
    },
    enabled: !!user
  })

  const subscriptionMap = useMemo(() => {
    const map: Record<string, { status: string; current_period_end: string | null }> = {}
    for (const s of userSubscriptions) {
      map[s.id] = { status: s.status, current_period_end: s.current_period_end }
    }
    return map
  }, [userSubscriptions])

  // Delete dependent mutation (calls edge function)
  const deleteDependentMutation = useMutation({
    mutationFn: async (id: string) => {
      // Use edge function to perform removal server-side and send email if needed
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/remove-beneficiary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ id })
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to remove dependent')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependents'] })
      setMessage('Dependent removed successfully.')
      setTimeout(() => setMessage(null), 3000)
    },
    onError: (error: any) => {
      setMessage(error.message || 'Failed to remove dependent')
    }
  })

  const canDeleteDependent = (dependent: any) => {
    // Allow deletion of all dependents for now
    return true
  }

  const handleDeleteDependent = (dependent: any) => {
    const deletable = canDeleteDependent(dependent)
    if (!deletable) {
      alert('This dependent is currently covered by an active subscription. You can remove them after the current term ends.')
      return
    }
    if (confirm('Remove this dependent? This action cannot be undone.')) {
      deleteDependentMutation.mutate(dependent.id as string)
    }
  }

  const addDependentMutation = useMutation({
    mutationFn: async (data: DependentForm) => {
      if (!user) throw new Error('Not authenticated')
  
      // Ensure we have a local subscription row if Chargebee shows active but DB is missing it
      let subscriptionId: string | null = activeSubscription?.id ?? null
  
      if (!subscriptionId && cbCurrent?.status === 'active' && cbCurrent?.subscription_id) {
        // Securely upsert a local subscription record via Edge Function (bypasses RLS using service role)
        const { data: sessionData, error: sessErr } = await supabase.auth.getSession()
        if (sessErr) throw sessErr
        const accessToken = sessionData?.session?.access_token
        if (!accessToken) throw new Error('Missing access token')
  
        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upsert-subscription`
        const payload = {
          subscription_id: cbCurrent.subscription_id,
          status: 'active',
          current_period_start: cbCurrent.current_period_start || null,
          current_period_end: cbCurrent.current_period_end || null,
          billing_period_unit: cbCurrent.billing_period_unit || cbCurrent.billing_period || null
        }
  
        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify(payload)
        })
  
        if (!res.ok) {
          const text = await res.text()
          console.error('upsert-subscription failed:', res.status, text)
          throw new Error('Failed to link subscription. Please try again.')
        }
  
        const json = await res.json()
        subscriptionId = json?.subscription?.id ?? null
      }
  
      // Call edge function to add dependent (server-side insertion + email)
      const { data: sessionData2 } = await supabase.auth.getSession()
      const accessToken2 = sessionData2?.session?.access_token
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/add-beneficiary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${accessToken2}`
        },
        body: JSON.stringify({
          first_name: data.first_name || null,
          last_name: data.last_name || null,
          relationship: data.relationship,
          phone_number: data.phone_number || null,
          email: data.email || null,
          date_of_birth: data.date_of_birth,
          subscription_id: subscriptionId
        })
      })
  
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Failed to add dependent')
      }
  
      // Optionally parse created dependent: const json = await res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dependents'] })
      setMessage('Dependent added successfully!')
      setShowAddForm(false)
      setFullName('')
      setFullNameError(null)
      setTimeout(() => setMessage(null), 3000)
      // If no active subscription anywhere (neither local nor Chargebee), guide user to plans
      if (!activeSubscription?.id && !(cbCurrent?.status === 'active' && cbCurrent?.subscription_id)) {
        window.location.href = '/plans?redirect=/dependents'
      }
    },
    onError: (error: any) => {
      setMessage(error.message || 'Failed to add dependent')
    }
  })

  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<DependentForm>({
    resolver: zodResolver(dependentSchema)
  })

  const onSubmit = (data: DependentForm) => {
    // Enforce onboarding cap
    const used = (dependents?.length || 0)
    const cap = onboardingCap?.number_of_loved_ones ?? null
    const remaining = cap != null ? Math.max(cap - used, 0) : Infinity
    if (remaining === 0) {
      setMessage('You have reached the maximum number of dependents allowed by your onboarding selection.')
      return
    }

    // Parse full name into first and last
    const name = (fullName || '').trim().replace(/\s+/g, ' ')
    const parts = name.split(' ')
    if (parts.length < 2) {
      setFullNameError('Please enter full name (first and last).')
      return
    }
    const first = parts.shift() as string
    const last = parts.join(' ')

    setValue('first_name', first, { shouldValidate: true })
    setValue('last_name', last, { shouldValidate: true })
    setFullNameError(null)

    addDependentMutation.mutate({ ...data, first_name: first, last_name: last })
    reset()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dependents...</p>
        </div>
      </div>
    )
  }

  // Compute remaining slots
  const usedCount = dependents?.length || 0
  const capTotal = onboardingCap?.number_of_loved_ones ?? null
  const remainingSlots = capTotal != null ? Math.max(capTotal - usedCount, 0) : Infinity
  const canAdd = remainingSlots > 0

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">Manage Dependents</h1>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {message && (
            <div className={`mb-6 p-4 rounded-md ${message.includes('successfully') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {message}
            </div>
          )}

          {!activeSubscription && !(cbCurrent?.status === 'active' && cbCurrent?.subscription_id) && (
            <div className="mb-6 p-4 rounded-md bg-blue-50 text-blue-800">
              <p>No active plan detected. You can add dependents now and subscribe to a plan afterward.</p>
              <div className="mt-3">
                <button
                  onClick={() => window.location.href = '/plans?redirect=/dependents'}
                  className="inline-flex items-center px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm"
                >
                  Choose a Plan
                </button>
              </div>
            </div>
          )}

          {cbCurrent?.status === 'active' && cbCurrent?.subscription_id && (
            <div className="mb-6 p-4 rounded-md bg-green-50 text-green-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">
                    Active Subscription: <span className="font-semibold">{cbCurrent.plan_name || 'Active Plan'}</span>
                  </p>
                  <p className="text-xs mt-1">
                    Next billing: {cbCurrent.current_period_end ? new Date(cbCurrent.current_period_end).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <span className="text-xs">
                  Billing: {cbCurrent.billing_period || 1} {String(cbCurrent.billing_period_unit || 'month').toLowerCase()}
                </span>
              </div>
              <p className="text-xs mt-2">
                New dependents added will be linked to this active subscription.
              </p>
            </div>
          )}

          <div className="bg-white shadow rounded-lg mb-6">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Your Dependents</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {capTotal != null
                      ? `${usedCount} of ${capTotal} used${!canAdd ? ' • limit reached' : ''}`
                      : `${usedCount} added`}
                  </p>
                </div>
                <button
                  onClick={() => canAdd && setShowAddForm(!showAddForm)}
                  disabled={!canAdd}
                  className={`px-4 py-2 rounded text-white ${canAdd ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}`}
                >
                  {showAddForm ? 'Cancel' : 'Add Dependent'}
                </button>
              </div>

              {showAddForm && (
                <div className="mt-6 border-t pt-6">
                  {!canAdd && (
                    <div className="mb-4 p-3 bg-yellow-50 text-yellow-800 rounded">
                      You have reached the maximum number of dependents allowed.
                    </div>
                  )}
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="md:col-span-2">
                        <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
                          Full Name
                        </label>
                        <input
                          id="full_name"
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Jane Doe"
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                        {fullNameError && (
                          <p className="mt-1 text-sm text-red-600">{fullNameError}</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="relationship" className="block text-sm font-medium text-gray-700">
                          Relationship
                        </label>
                        <select
                          {...register('relationship')}
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Select relationship</option>
                          <option value="spouse">Spouse</option>
                          <option value="child">Child</option>
                          <option value="parent">Parent</option>
                          <option value="sibling">Sibling</option>
                          <option value="other">Other</option>
                        </select>
                        {errors.relationship && (
                          <p className="mt-1 text-sm text-red-600">{errors.relationship.message}</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700">
                          Date of Birth
                        </label>
                        <input
                          {...register('date_of_birth')}
                          type="date"
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                        {errors.date_of_birth && (
                          <p className="mt-1 text-sm text-red-600">{errors.date_of_birth.message}</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700">
                          Phone Number
                        </label>
                        <input
                          {...register('phone_number')}
                          type="tel"
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                          Email (Optional)
                        </label>
                        <input
                          {...register('email')}
                          type="email"
                          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                        {errors.email && (
                          <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={addDependentMutation.isPending || !canAdd}
                        className={`px-4 py-2 rounded text-white ${canAdd ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'} focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50`}
                      >
                        {addDependentMutation.isPending ? 'Adding...' : 'Add Dependent'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {dependents?.map((dependent: any) => (
                <li key={dependent.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-700">
                            {dependent.first_name?.[0]}{dependent.last_name?.[0]}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {dependent.first_name} {dependent.last_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {dependent.relationship} • {new Date(dependent.date_of_birth).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-3">
                        {dependent.subscription_id ? (
                          <>
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                              Subscribed
                            </span>
                            {subscriptionMap[dependent.subscription_id]?.current_period_end && (
                              <span className="text-xs text-gray-600">
                                Term ends: {new Date(subscriptionMap[dependent.subscription_id].current_period_end as string).toLocaleDateString()}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                              No Plan
                            </span>
                            <button
                              onClick={() => window.location.href = '/plans?redirect=/dependents'}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              Subscribe to Plan
                            </button>
                          </>
                        )}

                        <Link
                          to={`/dependents/${dependent.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          View Details
                        </Link>

                        <button
                          onClick={() => handleDeleteDependent(dependent)}
                          disabled={!canDeleteDependent(dependent) || deleteDependentMutation.isPending}
                          className={`text-sm ${canDeleteDependent(dependent) ? 'text-red-600 hover:text-red-800' : 'text-gray-400 cursor-not-allowed'}`}
                          title={canDeleteDependent(dependent) ? 'Remove dependent' : 'Cannot remove while an active subscription covers them'}
                        >
                          {deleteDependentMutation.isPending ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {dependents?.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">No dependents added yet.</p>
                <p className="text-sm text-gray-400 mt-2">Add your first dependent to get started with family coverage.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default Dependents