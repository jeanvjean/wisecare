import { useState } from 'react'
import { useAuthStore } from '../store/auth'

function WebAuthnRegister() {
  const { registerWebAuthn, loading } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const isWebAuthnSupported = typeof navigator !== 'undefined' && navigator.credentials
  const isSecureContext = typeof window !== 'undefined' && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')

  const handleRegister = async () => {
    console.log('WebAuthnRegister: Starting registration')
    try {
      setError(null)
      console.log('WebAuthnRegister: Calling registerWebAuthn')
      await registerWebAuthn()
      console.log('WebAuthnRegister: Registration successful')
      setSuccess(true)
    } catch (err: any) {
      console.error('WebAuthnRegister: Registration failed', err)
      setError(err.message)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-green-600">Success!</h2>
            <p className="mt-2 text-gray-600">Your biometric authentication has been registered.</p>
            <p className="mt-2 text-sm text-gray-500">You can now use biometric login.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Register Biometric Authentication</h2>
          <p className="mt-2 text-sm text-gray-600">
            Add biometric authentication (fingerprint, face ID, etc.) to your account for easier login.
          </p>
        </div>

        {(!isWebAuthnSupported || !isSecureContext) && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
            {!isWebAuthnSupported
              ? 'WebAuthn is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.'
              : 'WebAuthn requires a secure connection (HTTPS). Please access the app over HTTPS or localhost.'}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleRegister}
            disabled={loading || !isWebAuthnSupported || !isSecureContext}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
          >
            {loading ? 'Registering...' : 'Register Biometric'}
          </button>
        </div>

        <div className="text-center">
          <p className="text-sm text-gray-600">
            Make sure your device supports biometric authentication and you've set it up in your device settings.
          </p>
        </div>
      </div>
    </div>
  )
}

export default WebAuthnRegister