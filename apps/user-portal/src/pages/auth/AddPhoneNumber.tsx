import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '../../store/auth'
import { useNavigate, useSearchParams } from 'react-router-dom'

const addPhoneSchema = z.object({
  phoneNumber: z.string().min(1, 'Phone number is required'),
  deliveryMethod: z.enum(['sms', 'whatsapp'], {
    required_error: 'Please select delivery method'
  })
})

type AddPhoneForm = z.infer<typeof addPhoneSchema>

function AddPhoneNumber() {
  const { sendPhoneOTP, loading, user } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''

  const { register, handleSubmit, formState: { errors }, watch } = useForm<AddPhoneForm>({
    resolver: zodResolver(addPhoneSchema),
    defaultValues: {
      deliveryMethod: 'sms' // Default to SMS
    }
  })

  const onSubmit = async (data: AddPhoneForm) => {
    try {
      setError(null)
      await sendPhoneOTP(data.phoneNumber, email, data.deliveryMethod)
      // Redirect to phone verification with phone number and delivery method
      navigate(`/verify-phone-otp?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(data.phoneNumber)}&method=${data.deliveryMethod}`)
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">Add Your Phone Number</h2>
          <p className="text-center text-sm text-gray-600 mt-2">
            Please provide your phone number and choose verification method
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
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="+1234567890"
            />
            {errors.phoneNumber && (
              <p className="mt-1 text-sm text-red-600">{errors.phoneNumber.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Verification Method
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <input
                  {...register('deliveryMethod')}
                  type="radio"
                  id="sms"
                  value="sms"
                  className="peer/sms sr-only"
                />
                <label
                  htmlFor="sms"
                  className="block w-full p-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg cursor-pointer peer-checked/sms:border-blue-600 peer-checked/sms:text-blue-600 peer-checked/sms:bg-blue-50 hover:bg-gray-50"
                >
                  <div className="flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7.776 5.553a.75.75 0 01.671 0l2.25 2.25a.75.75 0 010 1.062l-2.25 2.25a.75.75 0 01-.671 0l-2.25-2.25a.75.75 0 010-1.062l2.25-2.25zM3.75 13.5a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0v-2.25a.75.75 0 01.75-.75zm2.25.75a2.25 2.25 0 00-2.25 2.25v2.25a2.25 2.25 0 004.5 0v-2.25a2.25 2.25 0 00-2.25-2.25zm7.5-4.5a.75.75 0 01.75-.75h6a.75.75 0 010 1.5h-6a.75.75 0 01-.75-.75zm.75 2.25a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
                    </svg>
                    SMS
                  </div>
                </label>
              </div>
              <div className="relative">
                <input
                  {...register('deliveryMethod')}
                  type="radio"
                  id="whatsapp"
                  value="whatsapp"
                  className="peer/whatsapp sr-only"
                />
                <label
                  htmlFor="whatsapp"
                  className="block w-full p-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg cursor-pointer peer-checked/whatsapp:border-green-600 peer-checked/whatsapp:text-green-600 peer-checked/whatsapp:bg-green-50 hover:bg-gray-50"
                >
                  <div className="flex items-center">
                    <svg className="w-4 h-4 mr-2 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.587"/>
                    </svg>
                    WhatsApp
                  </div>
                </label>
              </div>
            </div>
            {errors.deliveryMethod && (
              <p className="mt-1 text-sm text-red-600">{errors.deliveryMethod.message}</p>
            )}
          </div>
          <div className="space-y-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Sending...' : `Send Verification Code via ${watch('deliveryMethod') === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}
            </button>
            <button
              type="button"
              onClick={() => navigate('/onboarding')}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Skip for Now
            </button>
          </div>
        </form>
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-2">
            Phone verification helps secure your account. You can verify later from your profile.
          </p>
          <p className="text-xs text-gray-500">
            Both SMS and WhatsApp delivery methods use the same verification code. Choose your preferred method.
          </p>
        </div>
      </div>
    </div>
  )
}

export default AddPhoneNumber