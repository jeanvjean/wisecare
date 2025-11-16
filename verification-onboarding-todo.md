# Phone Verification & Onboarding Flow Implementation

## Overview
Implement a forced verification flow where users must complete email verification, phone verification, and onboarding before accessing the main application.

## Current Status
- ✅ Phone number collection moved to post-email-verification
- ✅ Phone verification functions created and deployed
- ✅ Existing onboarding flow identified at `/onboarding`

## Implementation Steps

### Phase 1: Enhanced Signin & Verification Flow
- [x] Update signin edge function to check phone verification status
- [ ] Modify login flow to redirect unverified phone users to phone verification
- [ ] Update phone verification success to redirect to onboarding instead of dashboard

### Phase 2: Onboarding Integration
- [x] Check existing onboarding flow and identify entry point (/onboarding)
- [ ] Add onboarding completion tracking to user metadata
- [ ] Update App.tsx routing to handle onboarding flow
- [ ] Add middleware/guards to prevent access to dashboard without completed onboarding
- [ ] Update all navigation redirects to respect verification/onboarding flow

## User Journey Flow
```
Login → Check Status → Route Appropriately:
├── Email not verified → Verify Email → Phone Setup → Onboarding → Dependents
├── Email verified, Phone not verified → Phone Setup → Onboarding → Dependents
├── Email + Phone verified, Onboarding not complete → Onboarding → Dependents
└── Fully verified + onboarded → Dashboard (or Dependents)
```

## Key Components
- **AddPhoneNumber.tsx**: Collect phone number after email verification
- **VerifyPhoneOTP.tsx**: Verify phone number with OTP
- **Onboarding.tsx**: Existing 7-step onboarding flow
- **Login.tsx**: Enhanced to check verification status

## Database Changes
- Added `phone_number` and `is_phone_number_verified` to auth.users
- Existing `profiles.onboarding_completed` field used for tracking

## Edge Functions
- **signin**: Now checks phone verification status
- **send-phone-otp**: Sends OTP to authenticated user's phone
- **verify-phone-otp**: Verifies OTP and updates user metadata