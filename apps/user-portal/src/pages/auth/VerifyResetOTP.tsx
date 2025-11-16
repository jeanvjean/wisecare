import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { useNavigate, useSearchParams } from 'react-router-dom'

const otpSchema = z.object({
  otp: z.string().min(6, 'OTP must be 6 digits').max(6, 'OTP must be 6 digits')
})

type OTPSchema = z.infer<typeof otpSchema>

function VerifyResetOTP() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''

  const { register, handleSubmit, formState: { errors } } = useForm<OTPSchema>({
    resolver: zodResolver(otpSchema)
  })

  const onSubmit = async (data: OTPSchema) => {
    try {
      setError(null)
      setLoading(true)
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-reset-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`
        },
        body: JSON.stringify({ email, otp: data.otp })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'OTP verification failed')
      }

      const result = await response.json()
      
      // On success, redirect to reset password with token
      navigate(`/reset-password?email=${encodeURIComponent(email)}&token=${result.reset_token}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">Verify OTP</h2>
          <p className="text-center text-sm text-gray-600 mt-2">Enter the 6-digit code sent to {email}</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
              OTP Code
            </label>
            <input
              {...register('otp')}
              type="text"
              maxLength={6}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-center text-2xl tracking-widest"
              placeholder="000000"
            />
            {errors.otp && (
              <p className="mt-1 text-sm text-red-600">{errors.otp.message}</p>
            )}
          </div>
          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default VerifyResetOTP