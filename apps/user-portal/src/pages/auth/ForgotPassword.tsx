import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { Link } from 'react-router-dom'

const forgotSchema = z.object({
  email: z.string().email('Invalid email address')
})

type ForgotForm = z.infer<typeof forgotSchema>

function ForgotPassword() {
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema)
  })

  const onSubmit = async (data: ForgotForm) => {
    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reset-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`
        },
        body: JSON.stringify({ email: data.email })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send OTP')
      }

      setMessage('OTP sent to your email. Check your inbox.')
      // Redirect to OTP verification
      setTimeout(() => {
        window.location.href = `/verify-reset-otp?email=${encodeURIComponent(data.email)}`
      }, 2000)
    } catch (error: any) {
      setMessage(error.message || 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">Reset your password</h2>
          <p className="text-center text-sm text-gray-600 mt-2">Enter your email to receive reset instructions</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {message && (
            <div className={`p-4 rounded-md ${message.includes('sent') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {message}
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email address
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
          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Reset Email'}
            </button>
          </div>
          <div className="text-center">
            <span className="text-sm text-gray-600">Remember your password? </span>
            <Link to="/login" className="text-sm text-blue-600 hover:text-blue-500">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ForgotPassword