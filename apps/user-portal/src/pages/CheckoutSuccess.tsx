import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { supabase } from '../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

function CheckoutSuccess() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const processCheckoutSuccess = async () => {
      try {
        // Get URL parameters
        const params = new URLSearchParams(window.location.search)
        const hostedPageId = params.get('id')
        const state = params.get('state')

        if (!hostedPageId) {
          throw new Error('Missing hosted page ID')
        }

        console.log('Processing checkout success:', { hostedPageId, state })

        // Invalidate subscription queries to refetch updated data
        if (user) {
          queryClient.invalidateQueries({ queryKey: ['subscription', user.id] })
          queryClient.invalidateQueries({ queryKey: ['active-subscription', user.id] })
        }

        // Send purchase success email
        if (user) {
          try {
            // Get the current subscription to find the subscription ID
            const { data: currentSub } = await supabase
              .from('subscriptions')
              .select('chargebee_subscription_id')
              .eq('user_id', user.id)
              .eq('status', 'active')
              .order('created_at', { ascending: false })
              .limit(1)
              .single()

            if (currentSub?.chargebee_subscription_id) {
              // Get user session for authentication
              const { data: { session } } = await supabase.auth.getSession()
              if (session?.access_token) {
                // Send the purchase success email
                await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-purchase-success-email`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string
                  },
                  body: JSON.stringify({
                    subscription_id: currentSub.chargebee_subscription_id
                  })
                })
                console.log('Purchase success email sent')
              }
            }
          } catch (emailErr) {
            console.error('Failed to send purchase success email:', emailErr)
            // Don't fail the checkout process if email fails
          }
        }

        // Redirect to dashboard after a short delay
        setTimeout(() => {
          window.location.href = '/dashboard'
        }, 3000)

      } catch (err: any) {
        console.error('Checkout success processing error:', err)
        setError(err.message || 'Failed to process checkout success')
      } finally {
        setLoading(false)
      }
    }

    processCheckoutSuccess()
  }, [user, queryClient])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Processing your subscription...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Processing Error</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Subscription Successful!</h1>
        <p className="text-gray-600 mb-4">Your healthcare plan has been activated successfully.</p>
        <p className="text-sm text-gray-500 mb-6">Redirecting to your dashboard...</p>
        <button
          onClick={() => window.location.href = '/dashboard'}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
        >
          Go to Dashboard Now
        </button>
      </div>
    </div>
  )
}

export default CheckoutSuccess