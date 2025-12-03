import { create } from 'zustand'
import { supabase } from '../lib/supabase'

interface AuthState {
  user: any
  loading: boolean
  setUser: (user: any) => void
  signUp: (data: { firstName: string; lastName: string; country: string; email: string; password: string; phoneNumber: string; deliveryMethod: 'sms' | 'whatsapp' }) => Promise<void>
  signIn: (email: string, password: string) => Promise<{ needsEmailVerification: boolean; needsPhoneVerification: boolean; needsOnboarding: boolean; needsPlanSelection: boolean }>
  signInWithWebAuthn: (email: string) => Promise<void>
  registerWebAuthn: () => Promise<void>
  verifyOTP: (email: string, token: string) => Promise<void>
  sendPhoneOTP: (phoneNumber: string, email?: string, deliveryMethod?: 'sms' | 'whatsapp') => Promise<void>
  verifyPhoneOTP: (phoneNumber: string, token: string, email?: string) => Promise<{ session?: any; requiresLogin?: boolean }>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  setUser: (user) => set({ user }),
  signUp: async (data) => {
    set({ loading: true })
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          firstName: data.firstName,
          lastName: data.lastName,
          country: data.country,
          phoneNumber: data.phoneNumber,
          deliveryMethod: data.deliveryMethod
        })
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Signup failed')
      }
    } finally {
      set({ loading: false })
    }
  },
  signIn: async (email, password) => {
    set({ loading: true })
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          email,
          password
        })
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Signin failed')
      }
      const { session, needsEmailVerification, needsPhoneVerification, needsOnboarding, needsPlanSelection } = await response.json()

      // Set the session directly
      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token
      })
      if (error) throw error

      return { needsEmailVerification, needsPhoneVerification, needsOnboarding, needsPlanSelection }
    } finally {
      set({ loading: false })
    }
  },
  signInWithWebAuthn: async (email) => {
    set({ loading: true })
    try {
      // Get assertion options
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webauthn-authenticate/options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ email })
      })
      if (!response.ok) throw new Error('Failed to get assertion options')
      const options = await response.json()

      // Convert challenge and allowCredentials
      options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
      if (options.allowCredentials && Array.isArray(options.allowCredentials) && options.allowCredentials.length) {
        options.allowCredentials = options.allowCredentials.map((cred: any) => ({
          ...cred,
          id: Uint8Array.from(atob(cred.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
        }))
      } else {
        delete options.allowCredentials
      }

      // Get assertion
      const assertion = await navigator.credentials.get({ publicKey: options, mediation: 'required' }) as PublicKeyCredential
      if (!assertion) throw new Error('Authentication cancelled')

      // Send to verify
      const verifyResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webauthn-authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          email,
          assertion: {
            id: assertion.id,
            rawId: btoa(String.fromCharCode(...new Uint8Array(assertion.rawId))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
            type: assertion.type,
            response: {
              clientDataJSON: btoa(String.fromCharCode(...new Uint8Array((assertion.response as AuthenticatorAssertionResponse).clientDataJSON))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
              authenticatorData: btoa(String.fromCharCode(...new Uint8Array((assertion.response as AuthenticatorAssertionResponse).authenticatorData))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
              signature: btoa(String.fromCharCode(...new Uint8Array((assertion.response as AuthenticatorAssertionResponse).signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
              userHandle: (assertion.response as AuthenticatorAssertionResponse).userHandle ? btoa(String.fromCharCode(...new Uint8Array((assertion.response as AuthenticatorAssertionResponse).userHandle!))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') : null
            }
          }
        })
      })
      if (!verifyResponse.ok) throw new Error('Authentication failed')
      const responseData = await verifyResponse.json()
      console.log('Raw response data from server (client):', responseData)
      const { token } = responseData
      console.log('Received token from server (client):', token, 'Type:', typeof token)

      // Use the magic link token to establish a session
      console.log('Attempting to verify OTP with token:', token, 'for email:', email)
      if (!token || typeof token !== 'string' || token.trim() === '') {
        console.error('Authentication token is missing, not a string, or empty:', token)
        throw new Error('Authentication token is missing or invalid from server response.')
      }
      console.log('Token value before verifyOtp:', token);
      const { error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'magiclink'
      })
      if (error) {
        console.error('Magic link verification error:', error)
        throw error
      }
    } finally {
      set({ loading: false })
    }
  },
  registerWebAuthn: async () => {
    console.log('AuthStore: Starting registerWebAuthn')
    set({ loading: true })
    try {
      console.log('AuthStore: Getting session')
      const session = (await supabase.auth.getSession()).data.session
      if (!session) throw new Error('No active session')

      console.log('AuthStore: Fetching registration options')
      // Get registration options
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webauthn-register`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
        }
      })
      console.log('AuthStore: Options response status:', response.status)
      if (!response.ok) {
        const text = await response.text()
        console.error('AuthStore: Failed to get options:', text)
        throw new Error('Failed to get registration options')
      }
      const options = await response.json()
      console.log('AuthStore: Options received:', options)

      // Validate options
      if (!options.challenge || !options.user || !options.user.id) {
        throw new Error('Invalid registration options received from server')
      }

      // Convert challenge and user.id
      options.challenge = Uint8Array.from(atob(options.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
      options.user.id = new TextEncoder().encode(options.user.id)
      console.log('AuthStore: Options converted')

      console.log('AuthStore: Creating credential')
      // Create credential
      const credential = await navigator.credentials.create({ publicKey: options }) as PublicKeyCredential
      if (!credential) {
        console.log('AuthStore: Credential creation cancelled by user')
        throw new Error('Registration cancelled')
      }
      console.log('AuthStore: Credential created:', credential.id)

      console.log('AuthStore: Sending credential to server')
      // Send to register
      const registerResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webauthn-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          credential: {
            id: credential.id,
            rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
            type: credential.type,
            response: {
              clientDataJSON: btoa(String.fromCharCode(...new Uint8Array((credential.response as AuthenticatorAttestationResponse).clientDataJSON))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
              attestationObject: btoa(String.fromCharCode(...new Uint8Array((credential.response as AuthenticatorAttestationResponse).attestationObject))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
              transports: (credential.response as AuthenticatorAttestationResponse).getTransports ? (credential.response as AuthenticatorAttestationResponse).getTransports()! : []
            }
          }
        })
      })
      console.log('AuthStore: Register response status:', registerResponse.status)
      if (!registerResponse.ok) {
        const text = await registerResponse.text()
        console.error('AuthStore: Registration failed:', text)
        throw new Error('Registration failed')
      }
      const result = await registerResponse.json()
      console.log('AuthStore: Registration successful:', result)
    } finally {
      set({ loading: false })
    }
  },
  verifyOTP: async (email, token) => {
    set({ loading: true })
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-signup-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          email,
          otp: token
        })
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'OTP verification failed')
      }
    } finally {
      set({ loading: false })
    }
  },
  sendPhoneOTP: async (phoneNumber, email, deliveryMethod = 'sms') => {
    set({ loading: true })
    try {
      const headers: any = {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
      }

      // Set authorization header - use session token if available, otherwise anon key for anonymous access
      const session = (await supabase.auth.getSession()).data.session
      if (session) {
        headers.Authorization = `Bearer ${session.access_token}`
      } else {
        headers.Authorization = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      }

      const body: any = {
        phoneNumber,
        deliveryMethod: deliveryMethod || 'sms' // Default to SMS if not provided
      }
      if (email) body.email = email

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-phone-otp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send phone OTP')
      }
      
      const result = await response.json()
      console.log('OTP sent successfully via', result.delivery_method || deliveryMethod)
    } finally {
      set({ loading: false })
    }
  },
  verifyPhoneOTP: async (phoneNumber, token, email) => {
    set({ loading: true })
    try {
      const headers: any = {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
      }

      // Set authorization header - use session token if available, otherwise anon key for anonymous access
      const currentSession = (await supabase.auth.getSession()).data.session
      if (currentSession) {
        headers.Authorization = `Bearer ${currentSession.access_token}`
      } else {
        headers.Authorization = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      }

      const body: any = {
        phoneNumber,
        otp: token
      }
      if (email) body.email = email

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-phone-otp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Phone OTP verification failed')
      }

      const responseData = await response.json()

      // Handle session establishment
      if (responseData.email_otp && email) {
        // Session-less: use recovery OTP to create a real session
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          email,
          token: responseData.email_otp,
          type: 'recovery'
        })
        if (verifyErr) throw verifyErr

        const { data: { session: newSession } } = await supabase.auth.getSession()
        if (newSession?.user) {
          set({ user: newSession.user })
        }
        return { session: newSession }
      } else {
        // Session-based flow: refresh to get updated user metadata
        const { data: { session: newSession } } = await supabase.auth.refreshSession()
        if (newSession?.user) {
          set({ user: newSession.user })
        }
        return { session: newSession }
      }
    } finally {
      set({ loading: false })
    }
  },
  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null })
  }
}))