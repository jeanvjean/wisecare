import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '../../store/auth'
import { Link, useNavigate } from 'react-router-dom'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters')
})

type LoginForm = z.infer<typeof loginSchema>

function Login() {
  const { signIn, signInWithWebAuthn, loading } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [webauthnEmail, setWebauthnEmail] = useState('')
  const [showWebauthn, setShowWebauthn] = useState(false)
  const isWebAuthnSupported = typeof navigator !== 'undefined' && navigator.credentials
  const navigate = useNavigate()

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  })

  const onSubmit = async (data: LoginForm) => {
    try {
      setError(null)
      const { needsEmailVerification, needsPhoneVerification, needsOnboarding, needsPlanSelection } = await signIn(data.email, data.password)

      if (needsEmailVerification) {
        navigate(`/verify-otp?email=${encodeURIComponent(data.email)}`)
        return
      }

      if (needsPhoneVerification) {
        // User has email verified but phone not verified - redirect to add phone number
        navigate(`/add-phone-number?email=${encodeURIComponent(data.email)}`)
        return
      }

      if (needsOnboarding) {
        // User has email and phone verified but hasn't completed onboarding
        navigate('/onboarding')
        return
      }

      if (needsPlanSelection) {
        // User has completed onboarding but doesn't have an active subscription and hasn't skipped
        navigate('/plans')
        return
      }

      // User is fully verified, onboarded, and has a plan - redirect to dashboard
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message)
    }
  }

  const onWebauthnSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setError(null)
      await signInWithWebAuthn(webauthnEmail)
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">Sign in to HealthGuard</h2>
        </div>
        {showWebauthn ? (
          <form className="mt-8 space-y-6" onSubmit={onWebauthnSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="webauthn-email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                id="webauthn-email"
                type="email"
                value={webauthnEmail}
                onChange={(e) => setWebauthnEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : 'Sign in with Biometric'}
              </button>
            </div>
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowWebauthn(false)}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Back to password login
              </button>
            </div>
          </form>
        ) : (
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
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
            {isWebAuthnSupported && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowWebauthn(true)}
                  className="text-sm text-green-600 hover:text-green-500"
                >
                  Sign in with Biometric
                </button>
              </div>
            )}
            <div className="text-center">
              <Link to="/forgot-password" className="text-sm text-blue-600 hover:text-blue-500">
                Forgot your password?
              </Link>
            </div>
            <div className="text-center">
              <span className="text-sm text-gray-600">Don't have an account? </span>
              <Link to="/signup" className="text-sm text-blue-600 hover:text-blue-500">
                Sign up
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default Login