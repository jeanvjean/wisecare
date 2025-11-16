# Client-used Backend and Third-party Endpoints

This document catalogs all HTTP endpoints called from the client apps (User Portal and Admin where applicable), including our Supabase Edge Functions and third-party APIs used for country/city data.

For Supabase Edge Functions, the base URL is:
- {VITE\_SUPABASE\_URL}/functions/v1

All examples assume the user portal environment variables:
- VITE\_SUPABASE\_URL
- VITE\_SUPABASE\_ANON\_KEY

All client requests to our Edge Functions include:
- Headers:
  - Content-Type: application/json
  - apikey: VITE\_SUPABASE\_ANON\_KEY
  - Authorization: Bearer VITE\_SUPABASE\_ANON\_KEY (when anonymous access is sufficient)
  - OR Authorization: Bearer <session.access\_token> (when the endpoint requires the user JWT for auth context)

---

## 1) Plans (Product Catalog 2.0)

Endpoint:
- GET {VITE\_SUPABASE\_URL}/functions/v1/get-plans

Called from:
- [PlanSelection.tsx](apps/user-portal/src/pages/PlanSelection.tsx:15)

Headers:
- Content-Type: application/json
- apikey: VITE\_SUPABASE\_ANON\_KEY
- Authorization: Bearer VITE\_SUPABASE\_ANON\_KEY

Description:
- Server-side proxy to Chargebee Product Catalog 2.0 item prices
- Aggregates all pages and returns only active plan item prices (filters out addons/charges)
- Response fields include:
  - item_price_id (for checkout)
  - item_id
  - name, description
  - price (decimal), currency
  - period, period\_unit
  - status

Example Response (truncated):
[
  {
    "id": "plan\_monthly\_gold",
    "item_price_id": "plan\_monthly\_gold",
    "item_id": "gold",
    "name": "Gold Plan - Monthly",
    "description": "Healthcare plan",
    "price": 29.99,
    "currency": "USD",
    "period": 1,
    "period_unit": "month",
    "status": "active"
  }
]

---

## 2) Create Checkout (Hosted Pages for PC 2.0)

Endpoint:
- POST {VITE\_SUPABASE\_URL}/functions/v1/create-checkout

Called from:
- [PlanSelection.tsx](apps/user-portal/src/pages/PlanSelection.tsx:137)

Headers:
- Content-Type: application/json
- apikey: VITE\_SUPABASE\_ANON\_KEY
- Authorization: Bearer <session.access\_token> (User JWT, required)

Payload:
{
  "itemPriceId": "plan_monthly_gold", // item_price_id from get-plans
  "customerId": "<supabase_user_id>",
  "customerEmail": "<user_email>",
  "firstName": "<first>",
  "lastName": "<last>"
}

Notes:
- The function creates a Chargebee Hosted Page for item prices (PC 2.0)
- It sets:
  - subscription\_items[item\_price\_id][0] = itemPriceId
  - customer[id] = Supabase user id (so webhooks map back reliably)
  - customer[email], customer[first\_name], customer[last\_name]
  - redirect\_url and cancel\_url are derived from request Origin, which must be in Chargebee Allowed Domains
- Returns:
  - hostedPageUrl: string
  - hostedPageId: string
- On error: returns Chargebee error body with details for debugging

Example Success Response:
{
  "hostedPageUrl": "https://<site>.chargebee.com/hosted_pages/<id>",
  "hostedPageId": "<id>"
}

---

## 3) Get Current Subscription (Source of Truth from Chargebee)

Endpoint:
- GET {VITE\_SUPABASE\_URL}/functions/v1/get-current-subscription?customerId=<supabase_user_id>
- Optional fallback: GET ...?email=<user_email>

Called from:
- [PlanSelection.tsx](apps/user-portal/src/pages/PlanSelection.tsx:93) (to show current plan and mark Current)
- [Dashboard.tsx](apps/user-portal/src/pages/Dashboard.tsx:131) (preferred display, fallback to local DB)
- [Dependents.tsx](apps/user-portal/src/pages/Dependents.tsx:97) (to link dependents to active subscription if DB not yet upserted)

Headers:
- apikey: VITE\_SUPABASE\_ANON\_KEY
- Authorization: Bearer VITE\_SUPABASE\_ANON\_KEY

Response (when active plan is found):
{
  "subscription_id": "cb_sub_xxx",
  "status": "active",
  "current_period_start": "2025-09-01T00:00:00.000Z",
  "current_period_end": "2025-10-01T00:00:00.000Z",
  "item_price_id": "plan_monthly_gold",
  "plan_name": "Gold Plan - Monthly",
  "price": 29.99,
  "currency": "USD",
  "billing_period": 1,
  "billing_period_unit": "month"
}

Response when no subscription:
{
  "subscription": null
}

---

## 4) Countries and Cities (Third-party)

Service:
- CountriesNow API

Endpoints (used in multiple pages):
- GET https://countriesnow.space/api/v0.1/countries
  - Called from:
    - [Onboarding.tsx](apps/user-portal/src/pages/Onboarding.tsx:47)
    - [Profile.tsx](apps/user-portal/src/pages/Profile.tsx:37)
  - Returns a list of countries; client maps into string array of country names
- POST https://countriesnow.space/api/v0.1/countries/cities
  - Called from:
    - [Onboarding.tsx](apps/user-portal/src/pages/Onboarding.tsx:64)
  - Body: { "country": "<country_name>" }
  - Returns a list of cities/states for the given country

Notes:
- Used purely for onboarding/profile UI selection helpers
- Data is cached on the client via react-query (staleTime set appropriately)

---

## 5) Supabase Table Access (not HTTP functions but client-side queries)

The client also directly reads/writes to Supabase tables using the Supabase JS client. These are not HTTP endpoints we own, but worth noting:

- profiles: create/update/fetch user profile
- user\_onboarding: save onboarding answers
- user\_loved\_ones\_countries / user\_loved\_ones\_cities: save selections
- subscriptions: local mirror of Chargebee subscription (upserted via webhook and in-app fallback)
- dependents: create and list user dependents

Examples:
- [Dashboard.tsx](apps/user-portal/src/pages/Dashboard.tsx:43)
- [Dependents.tsx](apps/user-portal/src/pages/Dependents.tsx:36)
- [Onboarding.tsx](apps/user-portal/src/pages/Onboarding.tsx:99)
- [Profile.tsx](apps/user-portal/src/pages/Profile.tsx:47)


---

## 6) User Signup (Email OTP)

Endpoint:
- POST {VITE_SUPABASE_URL}/functions/v1/signup

Called from:
- [Signup.tsx](apps/user-portal/src/pages/auth/Signup.tsx)

Headers:
- Content-Type: application/json
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization: Bearer VITE_SUPABASE_ANON_KEY

Payload:
{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "country": "United States"
}

Optional Payload (for resending OTP):
{
  "email": "user@example.com",
  "resendOnly": true
}

Description:
- Creates a new user account with Supabase Auth
- Generates and sends a 6-digit OTP via email using Supabase Resend (Postmark SMTP)
- Stores OTP temporarily in user metadata with 10-minute expiration
- For existing users, can resend OTP without recreating account

Success Response:
{
  "message": "User created, OTP sent to email",
  "otp_id": "uuid-string"
}

Error Responses:
- 409: User already exists
- 400: Missing required fields

---

## 7) User Signin (With Verification Status)

Endpoint:
- POST {VITE_SUPABASE_URL}/functions/v1/signin

Called from:
- [Login.tsx](apps/user-portal/src/pages/auth/Login.tsx)

Headers:
- Content-Type: application/json
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization: Bearer VITE_SUPABASE_ANON_KEY

Payload:
{
  "email": "user@example.com",
  "password": "password123"
}

Description:
- Authenticates user with Supabase Auth
- Returns session tokens and verification status flags
- Checks email confirmation, phone verification, onboarding completion, and plan selection status
- Used by client to determine appropriate redirect after login

Success Response:
{
  "session": {
    "access_token": "jwt-token",
    "refresh_token": "refresh-token",
    "expires_at": 1638360000,
    "token_type": "bearer",
    "user": { /* user object */ }
  },
  "needsEmailVerification": false,
  "needsPhoneVerification": false,
  "needsOnboarding": false,
  "needsPlanSelection": true
}

---

## 8) Verify Signup OTP (Email Verification)

Endpoint:
- POST {VITE_SUPABASE_URL}/functions/v1/verify-signup-otp

Called from:
- [VerifyOTP.tsx](apps/user-portal/src/pages/auth/VerifyOTP.tsx)

Headers:
- Content-Type: application/json
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization: Bearer VITE_SUPABASE_ANON_KEY

Payload:
{
  "email": "user@example.com",
  "otp": "123456"
}

Description:
- Verifies the 6-digit OTP sent during signup
- Confirms user's email address in Supabase Auth
- Clears OTP data from user metadata
- OTP expires after 10 minutes

Success Response:
{
  "message": "Email verified successfully"
}

Error Responses:
- 400: Invalid OTP or OTP expired
- 404: User not found

---

## 9) Send Phone OTP (SMS or WhatsApp Verification)

Endpoint:
- POST {VITE_SUPABASE_URL}/functions/v1/send-phone-otp

Called from:
- [AddPhoneNumber.tsx](apps/user-portal/src/pages/auth/AddPhoneNumber.tsx)
- [Profile.tsx](apps/user-portal/src/pages/Profile.tsx)

Headers:
- Content-Type: application/json
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization:
  - Bearer <session.access_token> (preferred when user is authenticated), OR
  - Bearer VITE_SUPABASE_ANON_KEY (session-less; requires "email" in payload)

Payload (SMS):
{
  "phoneNumber": "+1234567890",
  "deliveryMethod": "sms",
  "email": "user@example.com" // required when Authorization uses anon key (no session)
}

Payload (WhatsApp):
{
  "phoneNumber": "+1234567890",
  "deliveryMethod": "whatsapp",
  "email": "user@example.com" // required when Authorization uses anon key (no session)
}

Description:
- Session-optional endpoint
  - With session (Authorization: Bearer <session.access_token>): updates/stores phone number in user metadata and writes OTP to user metadata
  - Without session (Authorization: Bearer VITE_SUPABASE_ANON_KEY): requires "email" in payload, looks up user by email and writes OTP to user metadata
- Generates and sends a 6-digit OTP via either SMS or WhatsApp using SendChamp
- deliveryMethod parameter is optional (defaults to "sms" for backward compatibility)
- WhatsApp delivery attempts template approach first, falls back to text message if templates not available
- OTP is stored temporarily in user metadata with 10-minute expiration

Success Response:
{
  "message": "OTP sent to phone number via whatsapp",
  "otp_id": "uuid-string",
  "delivery_method": "whatsapp"
}

Error Responses:
- 401: Authentication required
- 400: Phone number already verified or invalid delivery method

---

## 10) Verify Phone OTP (Phone Verification)

Endpoint:
- POST {VITE_SUPABASE_URL}/functions/v1/verify-phone-otp

Called from:
- [VerifyPhoneOTP.tsx](apps/user-portal/src/pages/auth/VerifyPhoneOTP.tsx)
- [Profile.tsx](apps/user-portal/src/pages/Profile.tsx)

Headers:
- Content-Type: application/json
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization:
  - Bearer <session.access_token> (preferred when user is authenticated), OR
  - Bearer VITE_SUPABASE_ANON_KEY (session-less; requires "email" in payload)

Payload:
{
  "phoneNumber": "+1234567890",
  "otp": "123456",
  "email": "user@example.com" // required when Authorization uses anon key (no session)
}

Description:
- Session-optional endpoint
  - With session (Authorization: Bearer <session.access_token>): verifies OTP and expiry from user metadata, updates user metadata to mark phone as verified, clears OTP data
  - Without session (Authorization: Bearer VITE_SUPABASE_ANON_KEY + "email" in payload): loads user by email, verifies OTP and expiry from user metadata, updates user metadata to mark phone as verified, clears OTP data, and returns a recovery email OTP (email_otp) so the client can establish a session via supabase.auth.verifyOtp
- Uses stored phone number if available, otherwise uses provided number

Success Response (session-based):
{
  "message": "Phone number verified successfully"
}

Success Response (session-less):
{
  "message": "Phone number verified successfully",
  "email_otp": "123456" // use with supabase.auth.verifyOtp({ email, token: email_otp, type: 'recovery' })
}

Error Responses:
- 401: Authentication required
- 400: Invalid OTP, OTP expired, or phone number mismatch

---

## 11) Get User by Email (Phone Verification Status)

Endpoint:
- POST {VITE_SUPABASE_URL}/functions/v1/get-user-by-email

Called from:
- [AddPhoneNumber.tsx](apps/user-portal/src/pages/auth/AddPhoneNumber.tsx) (to check if phone is already verified)

Headers:
- Content-Type: application/json
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization: Bearer VITE_SUPABASE_ANON_KEY

Payload:
{
  "email": "user@example.com"
}

Description:
- Service-side endpoint for checking user phone verification status
- Used during phone verification flow to determine if user already has verified phone
- Returns phone number and verification status

Success Response:
{
  "phoneNumber": "+1234567890",
  "isPhoneVerified": true
}

Or if no phone number:
{
  "phoneNumber": null,
  "isPhoneVerified": false
}

---

## 12) Get Billing History (Invoices and Subscriptions)

Endpoint:
- GET {VITE_SUPABASE_URL}/functions/v1/get-billing-history?customerId=<supabase_user_id>
- Alternative: GET ...?email=<user_email>

Called from:
- [Billing.tsx](apps/user-portal/src/pages/Billing.tsx)

Headers:
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization: Bearer VITE_SUPABASE_ANON_KEY

Description:
- Fetches billing history from Chargebee including invoices and subscription summaries
- Supports lookup by Supabase user ID or email address
- Returns paginated results with invoice details and subscription status
- Used to display billing history and current subscription information

Success Response:
{
  "customer_id": "cb_customer_xxx",
  "invoices": [{
    "id": "inv_xxx",
    "subscription_id": "sub_xxx",
    "status": "paid",
    "amount_paid": 2999,
    "amount_due": 0,
    "currency_code": "USD",
    "date": 1727481600,
    "paid_at": 1727485200,
    "due_date": 1727485200,
    "line_items": [{
      "entity_type": "item_price",
      "entity_id": "plan_monthly_gold",
      "date_from": 1727481600,
      "date_to": 1729987200,
      "unit_amount": 2999,
      "quantity": 1
    }]
  }],
  "subscriptions": [{
    "id": "sub_xxx",
    "status": "active",
    "current_term_start": 1727481600,
    "current_term_end": 1729987200,
    "billing_period_unit": "month",
    "plan_item_price_id": "plan_monthly_gold"
  }]
}

---

## 13) Upsert Subscription (Local Database Sync)

Endpoint:
- POST {VITE_SUPABASE_URL}/functions/v1/upsert-subscription

Called from:
- [chargebee-webhook/index.ts](supabase/functions/chargebee-webhook/index.ts) (webhook handler)

Headers:
- Content-Type: application/json
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization: Bearer <session.access_token> (User JWT, required)

Payload:
{
  "subscription_id": "sub_xxx",
  "status": "active",
  "current_period_start": "2025-09-01T00:00:00.000Z",
  "current_period_end": "2025-10-01T00:00:00.000Z",
  "billing_period_unit": "month"
}

Description:
- Securely upserts subscription data to local database after validating ownership
- Requires authenticated user session and validates subscription belongs to user
- Used by Chargebee webhooks to sync subscription status changes
- Prevents unauthorized subscription data manipulation

Success Response:
{
  "subscription": {
    "id": "<local_db_id>",
    "user_id": "<supabase_user_id>",
    "chargebee_subscription_id": "sub_xxx",
    "status": "active",
    "current_period_start": "2025-09-01T00:00:00.000Z",
    "current_period_end": "2025-10-01T00:00:00.000Z",
    "payment_frequency": "month"
  }
}

---

## 14) Send Reset OTP (Password Reset Initiation)

Endpoint:
- POST {VITE_SUPABASE_URL}/functions/v1/send-reset-otp

Called from:
- [ForgotPassword.tsx](apps/user-portal/src/pages/auth/ForgotPassword.tsx)

Headers:
- Content-Type: application/json
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization: Bearer VITE_SUPABASE_ANON_KEY

Payload:
{
  "email": "user@example.com"
}

Description:
- Initiates password reset process by sending OTP via email
- Generates 6-digit OTP and stores temporarily in user metadata with 10-minute expiration
- Uses Supabase Resend (Postmark SMTP) for email delivery
- Falls back to console logging if email service is not configured

Success Response:
{
  "message": "OTP sent to email",
  "otp_id": "uuid-string"
}

Error Responses:
- 404: User not found

---

## 15) Verify Reset OTP (Password Reset Verification)

Endpoint:
- POST {VITE_SUPABASE_URL}/functions/v1/verify-reset-otp

Called from:
- [VerifyResetOTP.tsx](apps/user-portal/src/pages/auth/VerifyResetOTP.tsx)

Headers:
- Content-Type: application/json
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization: Bearer VITE_SUPABASE_ANON_KEY

Payload:
{
  "email": "user@example.com",
  "otp": "123456"
}

Description:
- Verifies the 6-digit OTP sent for password reset
- Checks OTP expiration (10 minutes) and validity
- Generates a secure reset token with 15-minute expiration
- Clears OTP data and stores reset token in user metadata

Success Response:
{
  "verified": true,
  "reset_token": "uuid-string",
  "user_id": "supabase-user-id"
}

Error Responses:
- 400: Invalid OTP, OTP expired, or no OTP found
- 404: User not found

---

## 16) Reset Password (Password Update)

Endpoint:
- POST {VITE_SUPABASE_URL}/functions/v1/reset-password

Called from:
- [ResetPassword.tsx](apps/user-portal/src/pages/auth/ResetPassword.tsx)

Headers:
- Content-Type: application/json
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization: Bearer VITE_SUPABASE_ANON_KEY

Payload:
{
  "email": "user@example.com",
  "reset_token": "uuid-string",
  "password": "newpassword123"
}

Description:
- Completes password reset using verified reset token
- Validates reset token and expiration (15 minutes)
- Updates user password in Supabase Auth
- Clears reset token from user metadata
- Requires minimum 6-character password

Success Response:
{
  "success": true
}

Error Responses:
- 400: Invalid reset token, token expired, or weak password
- 404: User not found

---

## 17) Send Waitlist Email

Endpoint:
- POST {VITE_SUPABASE_URL}/functions/v1/send-waitlist-email

Called from:
- Client-side usage for waitlist notifications

Headers:
- Content-Type: application/json
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization: Bearer <session.access_token> (User JWT, required)

Payload:
{
  "to": "user@example.com",
  "subject": "WiseCare Waitlist Update",
  "userName": "John Doe",
  "countryState": "United States"
}

Description:
- Sends a waitlist notification email to users interested in WiseCare availability in specific countries/states
- Requires authenticated user session for authorization
- Updates the user's profile to add the country/state to their inform_me_of_countries array and sets inform_me_status to true
- Uses Postmark SMTP for email delivery with a custom HTML template
- Template includes WiseCare branding, personalized greeting, and notification about regional availability

Success Response:
{
  "success": true,
  "accepted": ["user@example.com"]
}

Error Responses:
- 400: Missing required fields (to, subject, userName, countryState)
- 401: Unauthorized (missing or invalid Authorization header)
- 500: Failed to send email or update user profile

---

## 18) Reactivate Subscription

Endpoint:
- POST {VITE_SUPABASE_URL}/functions/v1/reactivate-subscription

Called from:
- [Dashboard.tsx](apps/user-portal/src/pages/Dashboard.tsx) (when user clicks "Reactivate Plan")

Headers:
- Content-Type: application/json
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization: Bearer <session.access_token> (User JWT, required)

Optional Payload:
{
  "subscription_id": "sub_xxx"  // optional, finds cancelled subscription automatically if not provided
}

Description:
- Reactivates a cancelled or non-renewing subscription in Chargebee
- If subscription_id is not provided, automatically finds the user's cancelled/non-renewing subscription
- Calls Chargebee's `/subscriptions/{id}/reactivate` API endpoint
- Updates local database subscription status to 'active'
- Clears the cancellation_reason field on reactivation
- Sends confirmation email to the user about successful reactivation

Success Response:
{
  "subscription": {
    "id": "sub_xxx",
    "status": "active",
    "current_term_end": 1730419200
  },
  "message": "Subscription reactivated successfully"
}

Error Responses:
- 401: Missing Authorization bearer token or invalid token
- 404: No cancelled subscription found to reactivate
- 502: Chargebee API error (upstream_status and upstream_body included)

---

## 19) Send Purchase Success Email

Endpoint:
- POST {VITE_SUPABASE_URL}/functions/v1/send-purchase-success-email

Called from:
- Chargebee webhook handler or checkout success flow (after successful subscription creation)

Headers:
- Content-Type: application/json
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization: Bearer <session.access_token> (User JWT, required)

Payload:
{
  "subscription_id": "sub_xxx"  // required, Chargebee subscription ID
}

Description:
- Sends a congratulatory email to the user after successful plan purchase
- Verifies that the subscription belongs to the authenticated user
- Uses a custom HTML template with personalized messaging
- Includes next steps and call-to-action for adding beneficiaries
- Should only be called after confirmed successful subscription creation

Success Response:
{
  "message": "Purchase success email sent successfully"
}

Error Responses:
- 400: Missing subscription_id parameter
- 401: Missing Authorization bearer token or invalid token
- 404: Subscription not found or access denied

---

## 18) Cancel Subscription (Product Catalog 2.0)

Endpoint:
- POST {VITE_SUPABASE_URL}/functions/v1/cancel-subscription

Called from:
- [Dashboard.tsx](apps/user-portal/src/pages/Dashboard.tsx)

Client Headers (to Edge Function):
- Content-Type: application/json
- apikey: VITE_SUPABASE_ANON_KEY
- Authorization: Bearer <session.access_token> (User JWT, required)

Optional Client Payload:
{
  "subscription_id": "sub_xxx" // if omitted, the function finds the current active subscription for the user
}

Server-side Behavior:
- Implemented in [cancel-subscription/index.ts](supabase/functions/cancel-subscription/index.ts)
- Steps:
  1) Validate Authorization bearer token (user JWT) and resolve user id
  2) Resolve subscription id:
     - If subscription_id provided in body, use it
     - Otherwise, list Chargebee subscriptions by customer_id=user_id and pick the current active one
  3) Issue a Product Catalog 2.0 compliant cancellation request to Chargebee:
     - Method: POST
     - URL: https://{CHARGEBEE_SITE}.chargebee.com/api/v2/subscriptions/{subscription_id}/cancel
     - Headers:
       - Authorization: Basic (api_key:)
       - Accept: application/json
       - Content-Type: application/x-www-form-urlencoded
     - Body (form-encoded):
       - cancel_option = end_of_term
     - Notes:
       - This sets the Chargebee subscription to non_renewing until the current term ends
  4) Update local DB (subscriptions table) using the upstream status (typically non_renewing) and, if present, map Chargebee current_term_end (epoch seconds) to ISO as current_period_end
  5) Return the Chargebee subscription payload back to the client as { subscription: {...} }

Success Response (example, truncated):
{
  "subscription": {
    "id": "sub_xxx",
    "status": "non_renewing",
    "current_term_end": 1730419200
  }
}

Error Responses:
- On upstream failure, returns:
{
  "error": "Cancellation failed",
  "upstream_status": <number>,
  "upstream_body": <parsed_chargebee_error_or_text>
}
- Typical upstream errors:
  - 400 configuration_incompatible / pc2_to_pc1_error → indicates payload/format mismatch with Product Catalog 2.0
  - 405 http_method_not_supported → using an unsupported HTTP verb (e.g., PUT instead of POST) or wrong endpoint

Operational Notes:
- PC2 requires POST /subscriptions/{id}/cancel with application/x-www-form-urlencoded parameters. Using PUT /subscriptions/{id} with JSON (e.g., {"subscription":{"end_of_term":true}}) results in 405 http_method_not_supported on this endpoint and/or PC1 compatibility errors.
- The function includes minimal logging (path, method, parameter shape, upstream status) with sensitive data redacted.

Manual Deployment:
1) Ensure secrets are configured:
   - CHARGEBEE_SITE
   - CHARGEBEE_API_KEY
2) Deploy the function:
   - supabase functions deploy cancel-subscription

Manual Test Plan:
1) From the Dashboard consent modal (in [Dashboard.tsx](apps/user-portal/src/pages/Dashboard.tsx)), trigger cancellation
2) Expect 200 with subscription.status = non_renewing and a future current_term_end
3) Verify local DB:
   - subscriptions.status updated to non_renewing
   - subscriptions.current_period_end updated from Chargebee current_term_end (epoch → ISO)
4) If non-200, inspect upstream_status and upstream_body for actionable errors (domain allow-list, parameter format, credentials)
