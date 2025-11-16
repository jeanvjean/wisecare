import React, { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '../store/auth'
import { supabase } from '../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const profileSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  country: z.string().min(1, 'Country is required'),
  phone_number: z.string().optional()
})

const phoneVerificationSchema = z.object({
  phone_number: z.string().min(1, 'Phone number is required'),
  otp: z.string().length(6, 'OTP must be 6 digits')
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

type ProfileForm = z.infer<typeof profileSchema>
type ChangePasswordForm = z.infer<typeof changePasswordSchema>

function Profile() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<string | null>(null)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [searchCountry, setSearchCountry] = useState('')
  const [countryOpen, setCountryOpen] = useState(false)
  const [showWebAuthnRegister, setShowWebAuthnRegister] = useState(false)
  const [webauthnError, setWebauthnError] = useState<string | null>(null)
  const [webauthnSuccess, setWebauthnSuccess] = useState(false)
  const [showPhoneVerification, setShowPhoneVerification] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneOTP, setPhoneOTP] = useState('')
  const [phoneStep, setPhoneStep] = useState<'enter' | 'verify'>('enter')
  const [verifyingPhone, setVerifyingPhone] = useState(false)
  const isWebAuthnSupported = typeof navigator !== 'undefined' && navigator.credentials
  const isSecureContext = typeof window !== 'undefined' && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')

  const { data: countries = [] } = useQuery({
    queryKey: ['countries'],
    queryFn: async () => {
      const response = await fetch('https://countriesnow.space/api/v0.1/countries')
      const data = await response.json()
      return data.data.map((country: any) => country.country)
    },
    staleTime: 24 * 60 * 60 * 1000
  })

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      // Treat PostgREST "not found" as a missing profile (code PGRST116 or HTTP 406)
      if (error) {
        const status = (error as any)?.status
        if (error.code !== 'PGRST116' && status !== 406) {
          throw error
        }
      }
      // If profile doesn't exist, it means it wasn't created during signup.
      // This should ideally not happen if signup flow is followed correctly.
      // We will not create it here to ensure signup edge function is the single source of truth.
      // If a profile is truly missing, it indicates an issue in the signup process.
      if (!data && user) {
        console.warn(`Profile missing for user ${user.id}. This should have been created during signup.`)
        // Optionally, you could throw an error or redirect to an onboarding flow
        // For now, we'll return null and let the UI handle the missing profile gracefully.
        return null
      }
      return data
    },
    enabled: !!user
  })

  const { data: hasWebAuthn } = useQuery({
    queryKey: ['webauthn', user?.id],
    queryFn: async () => {
      if (!user) return false
      const { data, error } = await supabase
        .from('user_webauthn_credentials')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
      if (error) return false
      return data && data.length > 0
    },
    enabled: !!user
  })

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', user.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setMessage('Profile updated successfully!')
      setTimeout(() => setMessage(null), 3000)
    },
    onError: (error: any) => {
      setMessage(error.message || 'Failed to update profile')
    }
  })

  const changePasswordMutation = useMutation({
    mutationFn: async (data: ChangePasswordForm) => {
      if (!user) throw new Error('Not authenticated')
      // First, verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: data.currentPassword
      })
      if (signInError) throw new Error('Current password is incorrect')

      // Update to new password
      const { error } = await supabase.auth.updateUser({
        password: data.newPassword
      })
      if (error) throw error
    },
    onSuccess: () => {
      setMessage('Password changed successfully!')
      setShowChangePassword(false)
      setTimeout(() => setMessage(null), 3000)
    },
    onError: (error: any) => {
      setMessage(error.message || 'Failed to change password')
    }
  })

  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: profile || {}
  })

  const countryContainerRef = useRef<HTMLDivElement | null>(null)
  const selectedCountry = watch('country') || profile?.country || ''

  // Close dropdown on outside click or Escape
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!countryOpen) return
      if (countryContainerRef.current && !countryContainerRef.current.contains(e.target as Node)) {
        setCountryOpen(false)
        setSearchCountry('')
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setCountryOpen(false)
        setSearchCountry('')
      }
    }
    window.addEventListener('click', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [countryOpen])

  const { register: registerPassword, handleSubmit: handleSubmitPassword, formState: { errors: errorsPassword }, reset: resetPassword } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema)
  })

  // Update form when profile data loads
  React.useEffect(() => {
    if (profile) {
      reset(profile)
    }
  }, [profile, reset])

  const onSubmit = (data: ProfileForm) => {
    updateProfileMutation.mutate(data)
  }

  const onSubmitPassword = (data: ChangePasswordForm) => {
    changePasswordMutation.mutate(data)
    resetPassword()
  }

  const handleWebAuthnRegister = async () => {
    console.log('Profile: Starting WebAuthn registration')
    try {
      setWebauthnError(null)
      await useAuthStore.getState().registerWebAuthn()
      console.log('Profile: WebAuthn registration successful')
      setWebauthnSuccess(true)
      setShowWebAuthnRegister(false)
      queryClient.invalidateQueries({ queryKey: ['webauthn'] })
      setTimeout(() => setWebauthnSuccess(false), 3000)
    } catch (err: any) {
      console.error('Profile: WebAuthn registration failed', err)
      setWebauthnError(err.message)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Personal Information</h3>

            {message && (
              <div className={`mb-4 p-4 rounded-md ${message.includes('successfully') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label htmlFor="first_name" className="block text-sm font-medium text-gray-700">
                  First Name
                </label>
                <input
                  {...register('first_name')}
                  type="text"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                {errors.first_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="last_name" className="block text-sm font-medium text-gray-700">
                  Last Name
                </label>
                <input
                  {...register('last_name')}
                  type="text"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                {errors.last_name && (
                  <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="country" className="block text-sm font-medium text-gray-700">
                  Country
                </label>
                <div ref={countryContainerRef} className="relative mt-1">
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={countryOpen}
                    onClick={() => setCountryOpen((s) => !s)}
                    className="w-full text-left px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <span className="text-sm text-gray-900">{selectedCountry || 'Select a country'}</span>
                    <span className="float-right text-gray-400">{countryOpen ? '▴' : '▾'}</span>
                  </button>

                  {countryOpen && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded shadow-lg">
                      <div className="p-2">
                        <input
                          type="text"
                          placeholder="Search countries..."
                          value={searchCountry}
                          onChange={(e) => setSearchCountry(e.target.value)}
                          className="block w-full px-3 py-2 border border-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto p-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(countries as string[])
                            .filter((c: string) => c.toLowerCase().includes(searchCountry.toLowerCase()))
                            .map((c: string) => (
                              <label key={c} className="flex items-center text-sm cursor-pointer">
                                <input
                                  type="radio"
                                  value={c}
                                  {...register('country')}
                                  className="mr-2"
                                  onChange={() => {
                                    // close dropdown on selection
                                    setCountryOpen(false)
                                    setSearchCountry('')
                                  }}
                                />
                                {c}
                              </label>
                            ))}
                        </div>
                        {(countries as string[]).length === 0 && (
                          <p className="text-gray-500 text-sm">Loading countries...</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {errors.country && (
                  <p className="mt-1 text-sm text-red-600">{errors.country.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700">
                  Phone Number
                  {profile?.phone_number_verified && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Verified
                    </span>
                  )}
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    {...register('phone_number')}
                    type="tel"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="+1234567890"
                    defaultValue={profile?.phone_number || ''}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const phoneValue = watch('phone_number')?.trim()
                      if (!phoneValue || phoneValue === '') {
                        setMessage('Please enter a phone number first')
                        return
                      }
                      if (phoneValue === profile?.phone_number && profile?.phone_number_verified) {
                        setMessage('Phone number is already verified')
                        return
                      }
                      // Store the trimmed phone number
                      setPhoneNumber(phoneValue)
                      setPhoneStep('verify')
                      setVerifyingPhone(true)
                      // Send OTP with trimmed phone number
                      useAuthStore.getState().sendPhoneOTP(phoneValue)
                        .then(() => {
                          setMessage('OTP sent to your phone number')
                          setTimeout(() => setMessage(null), 3000)
                        })
                        .catch((error) => {
                          setMessage(error.message || 'Failed to send OTP')
                          setVerifyingPhone(false)
                        })
                    }}
                    disabled={verifyingPhone || (watch('phone_number')?.trim() === profile?.phone_number && profile?.phone_number_verified)}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:bg-gray-400"
                  >
                    {verifyingPhone ? 'Sending...' : 'Verify Phone'}
                  </button>
                </div>
                {errors.phone_number && (
                  <p className="mt-1 text-sm text-red-600">{errors.phone_number.message}</p>
                )}
              </div>

              {verifyingPhone && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="text-sm font-medium text-blue-900">Verify Phone Number</div>
                  </div>
                  <p className="text-sm text-blue-700 mb-3">
                    Enter the 6-digit code sent to {phoneNumber}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={phoneOTP}
                      onChange={(e) => setPhoneOTP(e.target.value)}
                      maxLength={6}
                      className="flex-1 px-3 py-2 border border-blue-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-center text-2xl tracking-widest"
                      placeholder="000000"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!phoneOTP.trim() || phoneOTP.length !== 6) {
                          setMessage('Please enter a valid 6-digit OTP')
                          return
                        }
                        useAuthStore.getState().verifyPhoneOTP(phoneNumber, phoneOTP)
                          .then(async () => {
                            // Update phone number and verification status in profiles table
                            const { error } = await supabase
                              .from('profiles')
                              .update({
                                phone_number: phoneNumber,
                                phone_number_verified: true
                              })
                              .eq('id', user!.id)

                            if (error) {
                              console.error('Error updating phone number in profiles:', error)
                              setMessage('Phone verification successful but failed to save to profile')
                            } else {
                              setMessage('Phone number verified and updated successfully!')
                              queryClient.invalidateQueries({ queryKey: ['profile'] })
                            }

                            setVerifyingPhone(false)
                            setPhoneOTP('')
                            setPhoneStep('enter')
                            setTimeout(() => setMessage(null), 3000)
                          })
                          .catch((error) => {
                            setMessage(error.message || 'Failed to verify OTP')
                          })
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVerifyingPhone(false)
                        setPhoneOTP('')
                        setPhoneStep('enter')
                      }}
                      className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updateProfileMutation.isPending}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg mt-6">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Account Information</h3>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Email</dt>
                <dd className="text-sm text-gray-900">{user?.email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Phone Number</dt>
                <dd className="text-sm text-gray-900 flex items-center gap-2">
                  {profile?.phone_number || 'Not set'}
                  {profile?.phone_number_verified && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Verified
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Account Created</dt>
                <dd className="text-sm text-gray-900">
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Unique User ID</dt>
                <dd className="text-sm text-gray-900">
                  {profile?.unique_id || 'N/A'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Biometric Authentication</dt>
                <dd className="text-sm text-gray-900">
                  {hasWebAuthn ? 'Enabled' : 'Not enabled'}
                </dd>
              </div>
            </dl>
            <div className="mt-6 space-x-4">
              <button
                onClick={() => setShowChangePassword(!showChangePassword)}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                {showChangePassword ? 'Cancel' : 'Change Password'}
              </button>
              {!hasWebAuthn ? (
                <button
                  onClick={() => setShowWebAuthnRegister(!showWebAuthnRegister)}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  {showWebAuthnRegister ? 'Cancel' : 'Enable Biometric Authentication'}
                </button>
              ) : (
                <button
                  onClick={async () => {
                    if (confirm('Are you sure you want to disable biometric authentication?')) {
                      const { error } = await supabase
                        .from('user_webauthn_credentials')
                        .delete()
                        .eq('user_id', user!.id)
                      if (error) {
                        setMessage('Failed to disable biometric authentication')
                      } else {
                        setMessage('Biometric authentication disabled')
                        queryClient.invalidateQueries({ queryKey: ['webauthn'] })
                      }
                      setTimeout(() => setMessage(null), 3000)
                    }
                  }}
                  className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                >
                  Disable Biometric Authentication
                </button>
              )}
            </div>
            {showChangePassword && (
              <div className="mt-6 border-t pt-6">
                <form onSubmit={handleSubmitPassword(onSubmitPassword)} className="space-y-6">
                  <div>
                    <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        {...registerPassword('currentPassword')}
                        type={showCurrentPassword ? 'text' : 'password'}
                        className="mt-1 block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5"
                      >
                        {showCurrentPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {errorsPassword.currentPassword && (
                      <p className="mt-1 text-sm text-red-600">{errorsPassword.currentPassword.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        {...registerPassword('newPassword')}
                        type={showNewPassword ? 'text' : 'password'}
                        className="mt-1 block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-sm leading-5"
                      >
                        {showNewPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {errorsPassword.newPassword && (
                      <p className="mt-1 text-sm text-red-600">{errorsPassword.newPassword.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        {...registerPassword('confirmPassword')}
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
                    {errorsPassword.confirmPassword && (
                      <p className="mt-1 text-sm text-red-600">{errorsPassword.confirmPassword.message}</p>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={changePasswordMutation.isPending}
                      className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
                    >
                      {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>

        {showWebAuthnRegister && (
          <div className="bg-white shadow rounded-lg mt-6">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Register Biometric Authentication</h3>
              <p className="text-sm text-gray-600 mb-4">
                Add biometric authentication (fingerprint, face ID, etc.) to your account for easier login.
              </p>

              {(!isWebAuthnSupported || !isSecureContext) && (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded mb-4">
                  {!isWebAuthnSupported
                    ? 'WebAuthn is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.'
                    : 'WebAuthn requires a secure connection (HTTPS). Please access the app over HTTPS or localhost.'}
                </div>
              )}

              {webauthnError && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-4">
                  {webauthnError}
                </div>
              )}

              {webauthnSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mb-4">
                  Biometric authentication registered successfully!
                </div>
              )}

              <div className="space-y-4">
                <button
                  onClick={handleWebAuthnRegister}
                  disabled={useAuthStore.getState().loading || !isWebAuthnSupported || !isSecureContext}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                >
                  {useAuthStore.getState().loading ? 'Registering...' : 'Register Biometric'}
                </button>
              </div>

              <div className="text-center mt-4">
                <p className="text-sm text-gray-600">
                  Make sure your device supports biometric authentication and you've set it up in your device settings.
                </p>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}

export default Profile