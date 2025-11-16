# WhatsApp Integration with SendChamp

This document describes the WhatsApp integration feature that allows OTP delivery via WhatsApp in addition to SMS.

## Overview

The WiseCare application now supports two delivery methods for phone verification OTPs:
1. **SMS** - Traditional text messaging
2. **WhatsApp** - WhatsApp Business API via SendChamp

Both delivery methods use the same verification code and backend validation logic.

## Backend Implementation

### Updated Endpoint: `/functions/v1/send-phone-otp`

**Request Body:**
```json
{
  "phoneNumber": "+2348123456789",
  "deliveryMethod": "sms" | "whatsapp",
  "email": "user@example.com" // Optional for authenticated users
}
```

**Response:**
```json
{
  "message": "OTP sent to phone number via whatsapp",
  "otp_id": "uuid-here",
  "delivery_method": "whatsapp"
}
```

### Environment Variables

Add the following environment variables to your Supabase project:

```bash
# Required for both SMS and WhatsApp
SENDCHAMP_PUBLIC_KEY=your_sendchamp_api_key
SENDCHAMP_MODE=live # or 'sandbox' for testing
DEFAULT_PHONE_COUNTRY_CODE=+234 # Optional, defaults to Nigeria

# Required for WhatsApp (defaults to 'WiseCare' if not set)
SENDCHAMP_WHATSAPP_SENDER=WiseCare
```

### Backend Functionality

The backend includes two key functions:

1. **sendSMS()** - Sends OTP via SMS using SendChamp SMS API
2. **sendWhatsApp()** - Sends OTP via WhatsApp using SendChamp WhatsApp API

The WhatsApp function attempts to use a template first, then falls back to plain text if templates are not available or approved.

## Frontend Implementation

### Updated Components

#### 1. Auth Store (`apps/user-portal/src/store/auth.ts`)

Updated `sendPhoneOTP()` function signature:
```typescript
sendPhoneOTP: (phoneNumber: string, email?: string, deliveryMethod?: 'sms' | 'whatsapp') => Promise<void>
```

#### 2. Add Phone Number Component (`apps/user-portal/src/pages/auth/AddPhoneNumber.tsx`)

- Added delivery method selection UI with radio buttons
- SMS option: Traditional messaging icon
- WhatsApp option: WhatsApp green icon
- Updated form validation to require delivery method
- Passes delivery method to backend

#### 3. Verify Phone OTP Component (`apps/user-portal/src/pages/auth/VerifyPhoneOTP.tsx`)

- Shows which delivery method was used
- Supports resending OTP via the same delivery method
- Provides option to change delivery method
- Maintains delivery method preference in URL parameters

## User Flow

### Initial Phone Addition
1. User enters phone number
2. User selects delivery method (SMS or WhatsApp)
3. Backend sends OTP via selected method
4. User redirected to verification page

### OTP Verification
1. User enters 6-digit code
2. Code is validated against backend
3. Success/Failure feedback
4. Option to resend via same method
5. Option to change delivery method

## Features

### WhatsApp Advantages
- ✅ Rich media support (images, documents)
- ✅ Better delivery reliability in some regions
- ✅ More engaging user experience
- ✅ No SMS charges in some countries
- ✅ Better for international users

### SMS Fallback
- ✅ Universal compatibility (all phones)
- ✅ Works without internet
- ✅ Familiar user experience
- ✅ No WhatsApp installation required

## Error Handling

The implementation includes comprehensive error handling:

1. **Missing API Keys**: Falls back to console logging for development
2. **WhatsApp API Errors**: Tries template approach, then text message, then console logging
3. **Invalid Delivery Methods**: Returns clear validation error
4. **Network Issues**: Graceful degradation with console logging

## Testing

To test the WhatsApp integration:

1. Set up your SendChamp account and get API credentials
2. Configure environment variables in Supabase
3. Test both SMS and WhatsApp flows
4. Verify OTP delivery and validation works correctly

## API Endpoints Used

### SendChamp WhatsApp API
- **Endpoint**: `https://api.sendchamp.com/api/v1/whatsapp/message/send`
- **Method**: POST
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer {SENDCHAMP_PUBLIC_KEY}`
  - `Accept: application/json`

### Text Message Request Format
```json
{
  "recipient": "+2348123456789",
  "sender": "WiseCare",
  "message": "Your WiseCare verification code is: 123456. This code will expire in 10 minutes.",
  "type": "text"
}
```

## Security Considerations

1. **OTP Code Generation**: 6-digit random codes generated client-side
2. **Code Storage**: Stored temporarily in user metadata with expiration
3. **API Keys**: Must be securely stored in environment variables
4. **Rate Limiting**: Consider implementing rate limiting for OTP requests
5. **Phone Number Validation**: Basic phone number format validation included

## Migration Notes

- Existing SMS functionality remains unchanged
- Default behavior is SMS for backward compatibility
- New `deliveryMethod` parameter is optional
- Users can switch between delivery methods anytime

## Future Enhancements

Potential future improvements:
1. User preference storage for delivery method
2. Rich message templates for different use cases
3. Delivery status tracking
4. Retry logic with exponential backoff
5. International phone number formatting
6. Voice call option as third delivery method