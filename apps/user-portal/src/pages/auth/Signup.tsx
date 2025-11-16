import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '../../store/auth'
import { Link, useNavigate } from 'react-router-dom'

const signupSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  country: z.string().min(1, 'Country is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

type SignupForm = z.infer<typeof signupSchema>

function Signup() {
  const { signUp, loading } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [countries, setCountries] = useState<{ value: string; label: string }[]>([])
  const [countriesLoading, setCountriesLoading] = useState(true)
  const navigate = useNavigate()

  const { register, handleSubmit, formState: { errors }, watch } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema)
  })

  const watchedFields = watch()

  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const response = await fetch('https://restcountries.com/v3.1/all?fields=name')
        const data = await response.json()
        const countryList = data
          .map((country: any) => ({
            value: country.name.common,
            label: country.name.common
          }))
          .sort((a: any, b: any) => a.label.localeCompare(b.label))
        setCountries(countryList)
      } catch (err) {
        console.error('Failed to fetch countries:', err)
        // Fallback to static list
        setCountries([
          { value: 'United Kingdom', label: 'United Kingdom' },
          { value: 'United States', label: 'United States' }
        ])
      } finally {
        setCountriesLoading(false)
      }
    }
    fetchCountries()
  }, [])

  const nextStep = () => {
    if (step === 1 && watchedFields.firstName && watchedFields.lastName && watchedFields.country) {
      setStep(2)
    }
  }

  const prevStep = () => {
    if (step === 2) {
      setStep(1)
    }
  }

  const onSubmit = async (data: SignupForm) => {
    try {
      setError(null)
      await signUp({
        firstName: data.firstName,
        lastName: data.lastName,
        country: data.country,
        email: data.email,
        password: data.password
      })
      // Redirect to OTP verification page
      navigate(`/verify-otp?email=${encodeURIComponent(data.email)}`)
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">Create your account</h2>
          <p className="text-center text-sm text-gray-600 mt-2">Step {step} of 2</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                  First Name
                </label>
                <input
                  {...register('firstName')}
                  type="text"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                {errors.firstName && (
                  <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                  Last Name
                </label>
                <input
                  {...register('lastName')}
                  type="text"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                {errors.lastName && (
                  <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="country" className="block text-sm font-medium text-gray-700">
                  Country
                </label>
                <input
                  {...register('country')}
                  type="text"
                  list="countries-list"
                  disabled={countriesLoading}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                  placeholder={countriesLoading ? 'Loading countries...' : 'Type to search country'}
                />
                <datalist id="countries-list">
                  {countries.map((country) => (
                    <option key={country.value} value={country.value} />
                  ))}
                </datalist>
                {errors.country && (
                  <p className="mt-1 text-sm text-red-600">{errors.country.message}</p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
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
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="relative">
                  <input
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    className="mt-1 block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    {...register('confirmPassword')}
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="mt-1 block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5"
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between">
            {step === 2 && (
              <button
                type="button"
                onClick={prevStep}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Back
              </button>
            )}
            {step === 1 ? (
              <button
                type="button"
                onClick={nextStep}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                disabled={!watchedFields.firstName || !watchedFields.lastName || !watchedFields.country || countriesLoading}
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="flex-1 ml-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            )}
          </div>
        </form>

        <div className="text-center">
          <span className="text-sm text-gray-600">Already have an account? </span>
          <Link to="/login" className="text-sm text-blue-600 hover:text-blue-500">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Signup