import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '../../store/auth'
import { useNavigate, useSearchParams } from 'react-router-dom'

const verifySchema = z.object({
  email: z.string().email('Invalid email address'),
  otp: z.string().length(6, 'OTP must be 6 digits')
})

type VerifyForm = z.infer<typeof verifySchema>

function VerifyOTP() {
  const { verifyOTP, loading } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const [resendLoading, setResendLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''

  const { register, handleSubmit, formState: { errors } } = useForm<VerifyForm>({
    resolver: zodResolver(verifySchema),
    defaultValues: { email }
  })

  const onSubmit = async (data: VerifyForm) => {
    try {
      setError(null)
      await verifyOTP(data.email, data.otp)
      // On success, check if phone number was provided during signup
      // If phone number exists, redirect to phone verification
      // Otherwise, redirect to add phone number step
      const phoneNumber = searchParams.get('phone')
      if (phoneNumber) {
        // Redirect to phone verification with phone number and delivery method
        const deliveryMethod = searchParams.get('deliveryMethod') || 'sms'
        navigate(`/verify-phone-otp?email=${encodeURIComponent(data.email)}&phone=${encodeURIComponent(phoneNumber)}&deliveryMethod=${deliveryMethod}`)
      } else {
        // No phone number provided, redirect to add phone number
        navigate(`/add-phone-number?email=${encodeURIComponent(data.email)}`)
      }
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleResendOTP = async () => {
    if (!email) return
    try {
      setResendLoading(true)
      setError(null)
      // We need to resend the signup OTP - this requires calling the signup function again
      // or creating a separate resend function. For now, we'll call signup again
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          email,
          password: 'dummy', // This won't be used since user already exists
          firstName: 'dummy',
          lastName: 'dummy',
          country: 'dummy',
          phoneNumber: 'dummy',
          resendOnly: true // We'll add this flag to the signup function
        })
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to resend OTP')
      }
      setError('OTP sent successfully!')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">Verify Your Email</h2>
          <p className="text-center text-sm text-gray-600 mt-2">
            Enter the 6-digit code sent to your email
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {error}
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
            <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
              Verification Code
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
              {loading ? 'Verifying...' : 'Verify Email'}
            </button>
          </div>
        </form>
        <div className="text-center">
          <p className="text-sm text-gray-600">
            Didn't receive the code?{' '}
            <button
              onClick={handleResendOTP}
              disabled={resendLoading}
              className="text-blue-600 hover:text-blue-500 disabled:opacity-50"
            >
              {resendLoading ? 'Sending...' : 'Resend'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default VerifyOTP