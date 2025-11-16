import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useAuthStore } from './store/auth'
import { supabase } from './lib/supabase'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import VerifyOTP from './pages/auth/VerifyOTP'
import AddPhoneNumber from './pages/auth/AddPhoneNumber'
import VerifyPhoneOTP from './pages/auth/VerifyPhoneOTP'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import VerifyResetOTP from './pages/auth/VerifyResetOTP'
import GettingStarted from './pages/GettingStarted'
import Onboarding from './pages/Onboarding'
import PlanSelection from './pages/PlanSelection'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Dependents from './pages/Dependents'
import DependentDetails from './pages/DependentDetails'
import CheckoutSuccess from './pages/CheckoutSuccess'
import Billing from './pages/Billing'
import FileUpload from './pages/FileUpload'
import WebAuthnRegister from './pages/WebAuthnRegister'

const queryClient = new QueryClient()

function AppContent() {
  const { user, setUser } = useAuthStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [setUser])

  // Fetch profile data to check onboarding and phone verification status
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (error && error.code !== 'PGRST116') {
        throw error
      }
      return data
    },
    enabled: !!user,
    staleTime: 0, // Always refetch to ensure latest onboarding status
    refetchOnWindowFocus: true
  })

  // Check active subscription from Chargebee (server truth)
  const { data: cbCurrent, isLoading: cbLoading } = useQuery({
    queryKey: ['current-subscription', user?.id],
    queryFn: async () => {
      if (!user) return null
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-current-subscription?customerId=${user.id}`
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`
        }
      })
      if (!res.ok) {
        try { console.error('current-subscription error:', res.status, await res.text()) } catch {}
        return null
      }
      return await res.json()
    },
    enabled: !!user,
    staleTime: 60 * 1000
  })

  const hasActivePlan = !!(cbCurrent?.status === 'active' && cbCurrent?.subscription_id)

  // Check if user needs to complete onboarding or verify phone
  const needsOnboarding = user && !profile?.onboarding_completed
  const needsPhoneVerification = user && !(profile?.is_phone_number_verified || profile?.phone_number_verified)
  const needsEmailVerification = user && !user.email_confirmed_at
  const needsPlanSelection = user && profile?.onboarding_completed && !hasActivePlan && !user.user_metadata?.plan_skipped

  // Also check user metadata for onboarding status as fallback
  const userMetadataOnboardingCompleted = user?.user_metadata?.onboarding_completed
  const effectiveNeedsOnboarding = needsOnboarding && !userMetadataOnboardingCompleted

  // Avoid misroutes while critical data is loading
  if (user && (profileLoading || cbLoading)) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<div />} />
        </Routes>
      </BrowserRouter>
    )
  }

  // Determine default route based on verification status
  let defaultRoute = '/dashboard'
  if (needsEmailVerification) {
    defaultRoute = '/verify-otp'
  } else if (needsPhoneVerification) {
    defaultRoute = '/add-phone-number'
  } else if (effectiveNeedsOnboarding) {
    defaultRoute = '/onboarding'
  } else if (needsPlanSelection) {
    defaultRoute = '/plans'
  }

  // Debug logging (remove in production)
  console.log('App routing debug:', {
    hasUser: !!user,
    needsEmailVerification,
    needsPhoneVerification,
    needsOnboarding,
    effectiveNeedsOnboarding,
    needsPlanSelection,
    hasActivePlan,
    cbCurrentStatus: cbCurrent?.status,
    cbSubId: cbCurrent?.subscription_id,
    isEmailVerified: !!user?.email_confirmed_at,
    isPhoneVerified: profile?.is_phone_number_verified || profile?.phone_number_verified,
    isOnboarded: profile?.onboarding_completed,
    userMetadataOnboardingCompleted,
    hasPlanSelected: user?.user_metadata?.plan_selected,
    defaultRoute
  })

  if (user === null) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<GettingStarted />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-otp" element={<VerifyOTP />} />
          <Route path="/add-phone-number" element={<AddPhoneNumber />} />
          <Route path="/verify-phone-otp" element={<VerifyPhoneOTP />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-reset-otp" element={<VerifyResetOTP />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Phone verification routes - accessible even when logged in; redirect away if already verified */}
        <Route path="/add-phone-number" element={needsPhoneVerification ? <AddPhoneNumber /> : <Navigate to={defaultRoute} replace />} />
        <Route path="/verify-phone-otp" element={needsPhoneVerification ? <VerifyPhoneOTP /> : <Navigate to={defaultRoute} replace />} />

        {/* Onboarding and other routes */}
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/plans" element={<PlanSelection />} />
        <Route path="/dashboard" element={(needsPhoneVerification || effectiveNeedsOnboarding || needsPlanSelection) ? <Navigate to={needsPhoneVerification ? "/add-phone-number" : effectiveNeedsOnboarding ? "/onboarding" : "/plans"} /> : <Dashboard />} />
        <Route path="/profile" element={(needsPhoneVerification || effectiveNeedsOnboarding || needsPlanSelection) ? <Navigate to={needsPhoneVerification ? "/add-phone-number" : effectiveNeedsOnboarding ? "/onboarding" : "/plans"} /> : <Profile />} />
        <Route path="/dependents/:id" element={<DependentDetails />} />
        <Route path="/dependents" element={(needsPhoneVerification || effectiveNeedsOnboarding || needsPlanSelection) ? <Navigate to={needsPhoneVerification ? "/add-phone-number" : effectiveNeedsOnboarding ? "/onboarding" : "/plans"} /> : <Dependents />} />
        <Route path="/billing" element={(needsPhoneVerification || effectiveNeedsOnboarding || needsPlanSelection) ? <Navigate to={needsPhoneVerification ? "/add-phone-number" : effectiveNeedsOnboarding ? "/onboarding" : "/plans"} /> : <Billing />} />
        <Route path="/upload" element={(needsPhoneVerification || effectiveNeedsOnboarding || needsPlanSelection) ? <Navigate to={needsPhoneVerification ? "/add-phone-number" : effectiveNeedsOnboarding ? "/onboarding" : "/plans"} /> : <FileUpload />} />
        <Route path="/checkout-success" element={(needsPhoneVerification || effectiveNeedsOnboarding || needsPlanSelection) ? <Navigate to={needsPhoneVerification ? "/add-phone-number" : effectiveNeedsOnboarding ? "/onboarding" : "/plans"} /> : <CheckoutSuccess />} />
        <Route path="/register-webauthn" element={(needsPhoneVerification || effectiveNeedsOnboarding || needsPlanSelection) ? <Navigate to={needsPhoneVerification ? "/add-phone-number" : effectiveNeedsOnboarding ? "/onboarding" : "/plans"} /> : <WebAuthnRegister />} />
        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}

export default App