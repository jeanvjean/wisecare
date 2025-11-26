import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/auth'
import { supabase } from '../lib/supabase'
import { useQuery } from '@tanstack/react-query'

// Using Chargebee Hosted Pages for Product Catalog 2.0 - no client-side Chargebee.js needed

function PlanSelection() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState<string | null>(null)
  const [currency, setCurrency] = useState<string>('USD')
  
  // Support coming back to a page after checkout
  const params = new URLSearchParams(window.location.search)
  const redirect = params.get('redirect') || '/dashboard'
  const quantityParam = params.get('quantity')

  // Map country codes to currencies
  const COUNTRY_TO_CURRENCY: { [key: string]: string } = {
    GB: 'GBP',
    US: 'USD',
    CA: 'CAD',
    NG: 'NGN',
  }

  // Detect user's country and determine currency on component mount
  useEffect(() => {
    const detectCurrency = async () => {
      try {
        // Using api.country.is for free geo-location detection
        const response = await fetch('https://api.country.is')
        if (response.ok) {
          const data = await response.json()
          const detectedCountry = data.country || 'US'
          const detectedCurrency = COUNTRY_TO_CURRENCY[detectedCountry] || 'USD'
          console.log('Detected country:', detectedCountry)
          console.log('Detected currency:', detectedCurrency)
          setCurrency(detectedCurrency)
        }
      } catch (error) {
        console.error('Error detecting country:', error)
        // Default to USD if detection fails
        setCurrency('USD')
      }
    }

    detectCurrency()
  }, [])

  // Fetch dependents count to use as quantity
  const { data: dependentsCount = 0 } = useQuery({
    queryKey: ['dependents-count', user?.id],
    queryFn: async () => {
      if (!user) return 0
      const { count, error } = await supabase
        .from('dependents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      if (error) {
        console.error('Error fetching dependents count:', error)
        return 0
      }
      return count || 0
    },
    enabled: !!user,
    staleTime: 60 * 1000
  })

  const { data: plans = [], isLoading: plansLoading, error: plansError } = useQuery({
    queryKey: ['plans', dependentsCount, quantityParam],
    queryFn: async () => {
      try {
        // Use quantity from URL param if present, otherwise use dependents count, default to 1
        const quantity = quantityParam ? parseInt(quantityParam) : Math.max(1, dependentsCount)
        // Try Supabase Edge Function first
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-plans?quantity=${quantity}&currency=${currency}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          return data
        } else {
          // Log the error details for debugging
          const errorText = await response.text()
          console.error('Edge Function error:', response.status, errorText)
          
          // Fallback to mock data for development
          console.warn('Falling back to mock plans data due to Edge Function error')
          return [
            {
              id: 'basic-plan',
              name: 'Basic Plan',
              description: 'Essential healthcare coverage',
              price: 29.99,
              currency: 'USD',
              period: 1,
              period_unit: 'month',
              status: 'active'
            },
            {
              id: 'premium-plan',
              name: 'Premium Plan',
              description: 'Comprehensive healthcare coverage',
              price: 59.99,
              currency: 'USD',
              period: 1,
              period_unit: 'month',
              status: 'active'
            },
            {
              id: 'family-plan',
              name: 'Family Plan',
              description: 'Complete family healthcare coverage',
              price: 99.99,
              currency: 'USD',
              period: 1,
              period_unit: 'month',
              status: 'active'
            }
          ]
        }
      } catch (error) {
        console.error('Plans fetch error:', error)
        // Return mock data as fallback
        return [
          {
            id: 'basic-plan',
            name: 'Basic Plan',
            description: 'Essential healthcare coverage',
            price: 29.99,
            currency: 'USD',
            period: 1,
            period_unit: 'month',
            status: 'active'
          }
        ]
      }
    },
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!user // Only fetch when user is available
  })

  // Fetch current subscription to show the user's active plan and mark it in the list
  const { data: currentSub } = useQuery({
    queryKey: ['current-subscription', user?.id],
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
        console.error('current-subscription error:', response.status, text)
        return null
      }
      return await response.json()
    },
    enabled: !!user,
    staleTime: 60 * 1000
  })

  const handleSelectPlan = async (itemPriceId: string) => {
    if (!user) return

    setLoading(itemPriceId)

    try {
      // Get user session for authentication
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('No authentication token')

      // Get user profile for customer details
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!profile) throw new Error('Profile not found')

      // Create hosted page for Product Catalog 2.0 checkout
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string
        },
        // Do not send redirectUrl from client; let server compute from request Origin to avoid domain mismatch
        body: JSON.stringify({
          itemPriceId,
          customerId: user.id,
          customerEmail: user.email,
          firstName: profile.first_name,
          lastName: profile.last_name,
          quantity: Math.max(1, dependentsCount)
        })
      })

      if (!response.ok) {
        const text = await response.text();
        let details = text;
        try {
          const j = JSON.parse(text);
          details = j.details || j.message || text;
        } catch {}
        console.error('create-checkout failed:', response.status, details);
        throw new Error(details || 'Failed to create checkout session');
      }

      const { hostedPageUrl } = await response.json()

      console.log('Redirecting to Chargebee checkout URL:', hostedPageUrl)

      // Add 10-second delay before redirecting to Chargebee checkout page
      setTimeout(() => {
        window.location.href = hostedPageUrl
      }, 10000)
      
    } catch (error) {
      console.error('Error creating checkout:', error)
      alert('Failed to start checkout process. Please try again.')
      setLoading(null)
    }
  }

  if (plansLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading plans...</p>
        </div>
      </div>
    )
  }

  if (plansError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error loading plans. Please try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!plansError && plans.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-700 mb-2">No active plans are available at the moment.</p>
          <p className="text-sm text-gray-500 mb-4">Please check back later or contact support.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>
    )
  }

  const handleSkipPlanSelection = async () => {
    if (!user) return

    try {
      // Mark plan as skipped in user metadata (but don't set plan_selected to true)
      // This allows users to return to plan selection later
      await supabase.auth.updateUser({
        data: { plan_skipped: true }
      })

      // Redirect to dashboard
      window.location.href = '/dashboard'
    } catch (error) {
      console.error('Error skipping plan selection:', error)
      alert('Failed to skip plan selection. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Choose Your Health Plan</h1>
          <p className="text-xl text-gray-600">Select the plan that best fits your healthcare needs</p>
        </div>

        {currentSub?.item_price_id && (
          <div className="mb-8 bg-indigo-50 border-l-4 border-indigo-400 p-4 rounded">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-indigo-800">
                  Current plan: <span className="font-semibold">{currentSub.plan_name || 'Active Plan'}</span>
                </p>
                <p className="text-xs text-indigo-700 mt-1">
                  Next billing: {currentSub.current_period_end ? new Date(currentSub.current_period_end).toLocaleDateString() : 'N/A'}
                </p>
              </div>
              <span className="text-xs text-indigo-700">
                Billing cycle: {currentSub.billing_period || 1} {String(currentSub.billing_period_unit || 'month').toLowerCase()}
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan: any) => (
            <div key={plan.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="p-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2 flex items-center justify-between">
                  <span>{plan.name}</span>
                  {currentSub?.item_price_id === ((plan as any).item_price_id || (plan as any).id) && (
                    <span className="ml-2 inline-block px-2 py-0.5 text-xs font-semibold bg-green-100 text-green-700 rounded">Current</span>
                  )}
                </h3>
                <div className="text-3xl font-bold text-blue-600 mb-4">
                  {new Intl.NumberFormat(navigator.language, { style: 'currency', currency: plan.currency }).format(plan.computed_total || plan.price)}
                  <span className="text-lg font-normal text-gray-600">/{plan.period_unit.toLowerCase()}</span>
                </div>
                <div className="text-gray-600 mb-6">
                  {plan.description || 'Comprehensive healthcare coverage for you and your family.'}
                </div>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    24/7 Healthcare Support
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Emergency Coverage
                  </li>
                  <li className="flex items-center">
                    <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Wellness Programs
                  </li>
                </ul>
                <button
                  onClick={() => handleSelectPlan((plan as any).item_price_id || (plan as any).id)}
                  disabled={
                    loading === plan.id ||
                    currentSub?.item_price_id === ((plan as any).item_price_id || (plan as any).id)
                  }
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading === plan.id
                    ? 'Processing...'
                    : currentSub?.item_price_id === ((plan as any).item_price_id || (plan as any).id)
                      ? 'Current Plan'
                      : 'Subscribe Now'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-12 space-y-4">
          <p className="text-gray-600">
            All plans include our core healthcare benefits. Contact support for custom plans.
          </p>
          <button
            onClick={handleSkipPlanSelection}
            className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Skip for Now
          </button>
        </div>
      </div>
    </div>
  )
}

export default PlanSelection