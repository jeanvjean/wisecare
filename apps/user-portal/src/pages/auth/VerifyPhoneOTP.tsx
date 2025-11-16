import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '../../store/auth'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const verifyPhoneSchema = z.object({
  phoneNumber: z.string().min(1, 'Phone number is required'),
  otp: z.string().length(6, 'OTP must be 6 digits')
})

type VerifyPhoneForm = z.infer<typeof verifyPhoneSchema>

function VerifyPhoneOTP() {
  const { verifyPhoneOTP, sendPhoneOTP, loading, user } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''
  const [phoneNumber, setPhoneNumber] = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState<'sms' | 'whatsapp'>('sms')
  const [_otpSent, setOtpSent] = useState(true) // OTP already sent from AddPhoneNumber

  const { register, handleSubmit, formState: { errors } } = useForm<VerifyPhoneForm>({
    resolver: zodResolver(verifyPhoneSchema),
    defaultValues: { phoneNumber }
  })

  // Get phone number from URL params
  const phoneParam = searchParams.get('phone') || ''
  const methodParam = searchParams.get('method') as 'sms' | 'whatsapp' || 'sms'

  useEffect(() => {
    if (phoneParam) {
      setPhoneNumber(phoneParam)
    }
    setDeliveryMethod(methodParam)
  }, [phoneParam, methodParam])

  // If phone is already verified, do not show this page — redirect appropriately
  useEffect(() => {
    const checkProfile = async () => {
      if (!user) return
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed, is_phone_number_verified, phone_number_verified')
        .eq('id', user.id)
        .single()
      if (!error && data) {
        const isVerified = !!(data.is_phone_number_verified || data.phone_number_verified)
        if (isVerified) {
          navigate(data.onboarding_completed ? '/dashboard' : '/onboarding', { replace: true })
        }
      }
    }
    checkProfile()
  }, [user, navigate])


  const onSubmit = async (data: VerifyPhoneForm) => {
    try {
      setError(null)
      await verifyPhoneOTP(data.phoneNumber, data.otp, email)

      // Fetch latest user to decide where to route next
      const { data: { user: latestUser } } = await supabase.auth.getUser()
      const meta = latestUser?.user_metadata || {}

      // Check user metadata for onboarding status
      if (meta.onboarding_completed) {
        navigate('/dashboard')
      } else {
        navigate('/onboarding')
      }
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">Verify Your Phone Number</h2>
          <p className="text-center text-sm text-gray-600 mt-2">
            Enter the 6-digit code sent to your phone
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700">
              Phone Number
            </label>
            <input
              {...register('phoneNumber')}
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            {errors.phoneNumber && (
              <p className="mt-1 text-sm text-red-600">{errors.phoneNumber.message}</p>
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
            <p className="mt-1 text-sm text-gray-500 text-center">
              Code sent via {deliveryMethod === 'whatsapp' ? 'WhatsApp' : 'SMS'}
            </p>
          </div>
          <div className="space-y-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify Phone Number'}
            </button>
            <button
              type="button"
              onClick={async () => {
                // Fetch latest user to decide where to route next
                const { data: { user: latestUser } } = await supabase.auth.getUser()
                const meta = latestUser?.user_metadata || {}
                if (meta.onboarding_completed) {
                  navigate('/dashboard')
                } else {
                  navigate('/onboarding')
                }
              }}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Skip for Now
            </button>
          </div>
        </form>
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-3">
            Didn't receive the code?
          </p>
          <div className="space-y-2">
            <button
              onClick={async () => {
                try {
                  setError(null)
                  await sendPhoneOTP(phoneNumber, email, deliveryMethod)
                  setOtpSent(true)
                } catch (err: any) {
                  setError(err.message)
                }
              }}
              className="w-full text-blue-600 hover:text-blue-500 text-sm font-medium"
              disabled={loading}
            >
              Resend via {deliveryMethod === 'whatsapp' ? 'WhatsApp' : 'SMS'}
            </button>
            <div className="text-xs text-gray-500">
              <button
                onClick={() => navigate(`/add-phone-number?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phoneNumber)}`)}
                className="text-blue-600 hover:text-blue-500"
              >
                Change delivery method
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VerifyPhoneOTP