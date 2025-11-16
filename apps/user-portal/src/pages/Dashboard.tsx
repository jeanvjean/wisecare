import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { supabase } from '../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

function Dashboard() {
  const { user, signOut } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [profile, setProfile] = useState<any>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancellationReason, setCancellationReason] = useState('')

  // Fetch user profile
  const { data: userProfile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      if (!data && user) {
        // Profile doesn't exist, create it from user metadata
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            first_name: user.user_metadata?.first_name || '',
            last_name: user.user_metadata?.last_name || '',
            country: user.user_metadata?.country || ''
          })
          .select()
          .single()
        if (insertError) throw insertError
        return newProfile
      }
      return data
    },
    enabled: !!user
  })

  // Fetch active subscription from local DB (if present)
  const { data: subscription } = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, plans(*)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()
      if (error && error.code !== 'PGRST116') throw error // PGRST116 is "not found"
      return data
    },
    enabled: !!user
  })

  // Fetch current subscription directly from Chargebee via Edge Function (source of truth)
  const { data: cbCurrent } = useQuery({
    queryKey: ['active-subscription', user?.id],
    queryFn: async () => {
      if (!user) return null
      // Prefer customerId mapping; webhook maps by id for new subs; for older ones, you could also try &email=
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-current-subscription?customerId=${user.id}`
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`
        }
      })
      if (!res.ok) {
        const text = await res.text()
        console.error('get-current-subscription failed:', res.status, text)
        return null
      }
      return await res.json()
    },
    enabled: !!user,
    staleTime: 60 * 1000
  })

  // Fetch dependents count
  const { data: dependentsCount } = useQuery({
    queryKey: ['dependents-count', user?.id],
    queryFn: async () => {
      if (!user) return 0
      const { count, error } = await supabase
        .from('dependents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      if (error) throw error
      return count || 0
    },
    enabled: !!user
  })

  // Check onboarding status
  const { data: onboardingStatus, isLoading: onboardingLoading } = useQuery({
    queryKey: ['onboarding-status', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return data || { onboarding_completed: false }
    },
    enabled: !!user
  })

  const handleSignOut = async () => {
    await signOut()
  }

  const handleButtonClick = (path: string) => {
    // Only gate when we know onboarding is explicitly false
    if (onboardingStatus?.onboarding_completed === false) {
      navigate('/onboarding')
    } else {
      navigate(path)
    }
  }

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession()
      if (sessErr) throw sessErr
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) throw new Error('Missing access token')

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-subscription`
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          cancellation_reason: cancellationReason.trim()
        })
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Cancellation failed: ${text}`)
      }

      return await res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-subscription'] })
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
      queryClient.invalidateQueries({ queryKey: ['active-subscription-cb'] })
      setMessage('Subscription cancelled successfully. It will end at the current term.')
      setTimeout(() => setMessage(null), 5000)
    },
    onError: (error: any) => {
      setMessage(error.message || 'Failed to cancel subscription')
    }
  })

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession()
      if (sessErr) throw sessErr
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) throw new Error('Missing access token')

      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reactivate-subscription`
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${accessToken}`
        }
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Reactivation failed: ${text}`)
      }

      return await res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-subscription'] })
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
      queryClient.invalidateQueries({ queryKey: ['active-subscription-cb'] })
      setMessage('Subscription reactivated successfully!')
      setTimeout(() => setMessage(null), 5000)
    },
    onError: (error: any) => {
      setMessage(error.message || 'Failed to reactivate subscription')
    }
  })

  const handleCancelSubscription = () => {
    setShowCancelModal(true)
  }

  const confirmCancelSubscription = () => {
    if (!cancellationReason.trim()) {
      setMessage('Please provide a reason for cancellation')
      return
    }
    setShowCancelModal(false)
    cancelMutation.mutate()
  }

  const cancelCancelSubscription = () => {
    setShowCancelModal(false)
  }

  const handleReactivateSubscription = () => {
    reactivateMutation.mutate()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">HealthGuard Dashboard</h1>
              <p className="text-sm text-gray-600">Welcome back, {userProfile?.first_name}!</p>
              {user?.user_metadata?.unique_id && (
                <p className="text-xs text-gray-500 mt-1">User ID: {user.user_metadata.unique_id}</p>
              )}
            </div>
            <div className="flex space-x-4">
              <Link
                to={onboardingStatus?.onboarding_completed === false ? '/onboarding' : '/profile'}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 inline-flex items-center justify-center"
              >
                Profile
              </Link>
              <button
                onClick={handleSignOut}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Sign Out
              </button>
            </div>
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

          {/* Onboarding reminder */}
          {!onboardingStatus?.onboarding_completed && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    <strong>Complete your onboarding!</strong> Finish setting up your account to access all features.
                  </p>
                  <div className="mt-2">
                    <Link
                      to="/onboarding"
                      className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1 rounded inline-block"
                    >
                      Continue Onboarding
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Reminder to add dependents */}
          {onboardingStatus?.onboarding_completed && dependentsCount === 0 && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    <strong>Don't forget to add your dependents!</strong> Complete your family coverage by registering your loved ones.
                  </p>
                  <div className="mt-2">
                    <Link
                      to={onboardingStatus?.onboarding_completed === false ? '/onboarding' : '/dependents?add=1'}
                      className="text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-3 py-1 rounded inline-block"
                    >
                      Add Dependents Now
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Plan selection prompt if onboarded but no active plan */}
          {onboardingStatus?.onboarding_completed && !(cbCurrent?.plan_name || subscription?.plans?.name) && (
            <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 10-1.414 1.414L9 13.414l4.707-4.707z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-700">
                    <strong>Select a plan to activate your coverage.</strong> You&apos;ve completed onboarding but don&apos;t have an active plan yet.
                  </p>
                  <div className="mt-2">
                    <Link
                      to="/plans"
                      className="text-sm bg-green-100 hover:bg-green-200 text-green-800 px-3 py-1 rounded inline-block"
                    >
                      Select a Plan
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-500 rounded"></div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Active Plan</dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {/* Prefer Chargebee's current sub; fallback to local DB join; finally "No Active Plan" */}
                        {cbCurrent?.plan_name
                          || subscription?.plans?.name
                          || 'No Active Plan'}
                      </dd>
                      {cbCurrent?.status === 'active' && (
                        <dd className="text-sm text-red-600 mt-1">
                          <button onClick={handleCancelSubscription} className="hover:underline">
                            Cancel Subscription
                          </button>
                        </dd>
                      )}
                      {(cbCurrent?.status === 'cancelled' || cbCurrent?.status === 'non_renewing') && (
                        <dd className="text-sm text-green-600 mt-1">
                          <button onClick={handleReactivateSubscription} className="hover:underline" disabled={reactivateMutation.isPending}>
                            {reactivateMutation.isPending ? 'Reactivating...' : 'Reactivate Plan'}
                          </button>
                        </dd>
                      )}
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-500 rounded"></div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Next Billing</dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {/* Prefer Chargebee’s period end; fallback to local DB */}
                        {cbCurrent?.current_period_end
                          ? new Date(cbCurrent.current_period_end).toLocaleDateString()
                          : subscription?.current_period_end
                            ? new Date(subscription.current_period_end).toLocaleDateString()
                            : 'N/A'}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-purple-500 rounded"></div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Dependents</dt>
                      <dd className="text-lg font-medium text-gray-900">{dependentsCount} Members</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Link
                  to={onboardingStatus?.onboarding_completed === false ? '/onboarding' : '/plans'}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-center"
                >
                  {cbCurrent?.plan_name || subscription?.plans?.name ? 'Change Plan' : 'Get Plan'}
                </Link>
                <Link
                  to={onboardingStatus?.onboarding_completed === false ? '/onboarding' : '/dependents'}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-center"
                >
                  Manage Dependents
                </Link>
                <Link
                  to={onboardingStatus?.onboarding_completed === false ? '/onboarding' : '/billing'}
                  className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 text-center"
                >
                  View Billing History
                </Link>
                <Link
                  to={onboardingStatus?.onboarding_completed === false ? '/onboarding' : '/upload'}
                  className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 text-center"
                >
                  Upload Files
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Cancellation Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Cancel Subscription</h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-gray-700 mb-4">
                Are you sure you want to cancel your subscription? It will end at the current billing period and you will retain access until then.
              </p>
              <div className="mb-4">
                <label htmlFor="cancellation-reason" className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for cancellation (required)
                </label>
                <select
                  id="cancellation-reason"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  required
                >
                  <option value="">Select a reason...</option>
                  <option value="too_expensive">Too expensive</option>
                  <option value="not_using_service">Not using the service</option>
                  <option value="found_alternative">Found a better alternative</option>
                  <option value="temporary_pause">Temporary pause</option>
                  <option value="technical_issues">Technical issues</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end space-x-3">
              <button
                onClick={() => {
                  setCancellationReason('')
                  setShowCancelModal(false)
                }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                disabled={cancelMutation.isPending}
              >
                Keep Subscription
              </button>
              <button
                onClick={confirmCancelSubscription}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard