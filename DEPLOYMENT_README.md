# WiseCare Deployment Guide

This guide covers the complete deployment process for the WiseCare application, including Supabase edge functions, database migrations, and environment configuration.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Database Deployment](#database-deployment)
- [Edge Functions Deployment](#edge-functions-deployment)
- [Testing Deployment](#testing-deployment)
- [Troubleshooting](#troubleshooting)
- [Environment Variables](#environment-variables)

## Prerequisites

### Required Software
- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **Supabase CLI** (v1.200.3 or higher)
  ```bash
  npm install -g supabase@latest
  ```
- **Git** - [Download](https://git-scm.com/)

### Required Accounts
- **Supabase Account** - [Sign up](https://supabase.com/)
- **Twilio Account** (for SMS/WhatsApp) - [Sign up](https://twilio.com/)
- **Meta Business Account** (for WhatsApp Business API) - [Apply](https://developers.facebook.com/docs/whatsapp/)
- **Chargebee Account** (for subscriptions) - [Sign up](https://chargebee.com/)

### Verify Installation
```bash
node --version
supabase --version
```

## Environment Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd wisecare
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Initialize Supabase (if not already done)
```bash
supabase init
```

### 4. Link to Your Supabase Project
```bash
supabase link --project-ref your-project-ref
```

You can find your project ref in the Supabase dashboard URL: `https://supabase.com/dashboard/project/YOUR-PROJECT-REF`

### 5. Set Up Environment Variables

#### Create the .env File
Create a `.env` file in the root directory of your project:

```bash
touch .env
```

Add all required environment variables to the `.env` file:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Twilio Configuration (for SMS/WhatsApp)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Email Configuration (Supabase Resend/Postmark)
WELCOME_EMAIL_SENDER=your-welcome-email@yourdomain.com

# Chargebee Configuration (for subscriptions)
CHARGEBEE_SITE=your-chargebee-site
CHARGEBEE_API_KEY=your-chargebee-api-key

# Additional Email Configuration (if using Postmark directly)
EMAIL_FROM=your-email@yourdomain.com
EMAIL_FROM_NAME=WiseCare
POSTMARK_SERVER_TOKEN=your-postmark-server-token
SMTP_USER=your-smtp-user
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_PASS=your-smtp-password

# Security
JWT_SECRET=your-secure-jwt-secret

# Twilio Additional (if using alphanumeric sender)
TWILIO_ALPHA_NUMERIC_SENDER=YourAppName
```

#### Deploy Environment Variables to Supabase

After creating the `.env` file locally, you need to sync these variables to your Supabase project:

##### Option 1: Manual Setup via Dashboard
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Settings** → **Environment Variables**
4. Click **"Add Variable"** for each variable
5. Copy the values from your `.env` file

##### Option 2: Using Supabase CLI
The Supabase CLI can automatically sync your local `.env` file:

```bash
# Sync environment variables from .env file
supabase secrets set --env-file .env

# Or set individual variables
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set TWILIO_ACCOUNT_SID=your-twilio-account-sid
```

##### Option 3: Using Supabase CLI (Linked Project)
If your project is linked locally:

```bash
# This will sync secrets from your linked project
supabase secrets list
```

#### Verify Environment Variables
Check that all variables are properly set:

```bash
# List all secrets
supabase secrets list

# Check specific variable
supabase secrets list | grep TWILIO
```

#### Important Notes
- **Never commit `.env` files** to version control
- **Service Role Key**: Only use for server-side operations, never expose to client
- **API Keys**: Keep secure and rotate regularly
- **Environment Sync**: Always sync variables after deployment

### 6. Configure WhatsApp (Optional)

WhatsApp integration requires additional setup beyond SMS. The application supports both SMS and WhatsApp for OTP delivery.

#### WhatsApp Business API Setup

1. **Apply for WhatsApp Business API**
   - Go to [Meta for Developers](https://developers.facebook.com/docs/whatsapp/)
   - Create a Meta Business Account
   - Apply for WhatsApp Business API access
   - Wait for approval (can take 1-4 weeks)

2. **Connect Twilio to WhatsApp**
   - In Twilio Console → **Messaging** → **Settings** → **WhatsApp**
   - Follow the setup wizard to connect your approved WhatsApp Business API
   - Get your WhatsApp-enabled phone number

3. **Configure Phone Number**
   - Ensure your Twilio phone number is enabled for WhatsApp
   - The same `TWILIO_PHONE_NUMBER` is used for both SMS and WhatsApp
   - Test the WhatsApp integration in sandbox mode first

#### WhatsApp Environment Variables

Add these additional variables for WhatsApp support:

```bash
# WhatsApp Configuration (Optional)
TWILIO_WHATSAPP_NUMBER=+1234567890  # Same as TWILIO_PHONE_NUMBER if WhatsApp-enabled
```

#### Testing WhatsApp

1. **Sandbox Testing**
   ```bash
   # Test WhatsApp OTP
   curl -X POST https://your-project.supabase.co/functions/v1/send-phone-otp \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -d '{"phoneNumber":"+1234567890","deliveryMethod":"whatsapp"}'
   ```

2. **Production Testing**
   - Use verified WhatsApp numbers for testing
   - WhatsApp has strict opt-in requirements
   - Users must initiate contact or opt-in to receive messages

#### WhatsApp Limitations
- **Approval Required**: Meta approval needed for production
- **Opt-in Required**: Users must explicitly opt-in to receive WhatsApp messages
- **Template Messages**: For marketing messages, templates must be pre-approved
- **Rate Limits**: WhatsApp has stricter rate limits than SMS

#### Fallback Behavior
If WhatsApp is not configured or fails, the system automatically falls back to SMS delivery.

## Database Deployment

### 1. Reset Database (Development Only)
⚠️ **WARNING**: This will delete all data. Only use in development.

```bash
supabase db reset
```

### 2. Push Database Migrations
```bash
supabase db push
```

This will:
- Create all tables (profiles, subscriptions, beneficiaries, etc.)
- Set up Row Level Security (RLS) policies
- Create indexes and constraints
- Enable necessary extensions

### 3. Verify Database Setup
Check that all tables exist:
```bash
supabase db inspect
```

## Edge Functions Deployment

### 1. Deploy All Functions
```bash
supabase functions deploy
```

This deploys all functions in the `supabase/functions/` directory.

### 2. Deploy Specific Functions
```bash
# Deploy individual functions
supabase functions deploy signup
supabase functions deploy send-phone-otp
supabase functions deploy get-plans

# Deploy multiple functions
supabase functions deploy signup send-phone-otp get-plans
```

### 3. List Deployed Functions
```bash
supabase functions list
```

### 4. View Function Logs
```bash
# View logs for all functions
supabase functions logs

# View logs for specific function
supabase functions logs signup

# Follow logs in real-time
supabase functions logs signup --follow
```

## Testing Deployment

### 1. Local Development
Start local Supabase environment:
```bash
supabase start
```

Test functions locally:
```bash
# Test signup function
curl -X POST http://localhost:54321/functions/v1/signup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"email":"test@example.com","password":"TestPass123!","firstName":"Test","lastName":"User","country":"nigeria"}'
```

### 2. Remote Testing
Test deployed functions:
```bash
# Test signup function
curl -X POST https://your-project.supabase.co/functions/v1/signup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"email":"test@example.com","password":"TestPass123!","firstName":"Test","lastName":"User","country":"nigeria"}'
```

### 3. Use Postman Collection
Import the `postman_collection.json` file into Postman and test all endpoints.

## Environment Variables Setup

### Supabase Dashboard
1. Go to **Settings** → **Environment Variables**
2. Add all required variables from your `.env` file

### Local Development
Variables in `.env` are automatically loaded by Supabase CLI.

### Production Deployment
Ensure all environment variables are set in your Supabase project settings.

## Troubleshooting

### Common Issues

#### 1. "Function not found" Error
```bash
# Check if function is deployed
supabase functions list

# Redeploy the function
supabase functions deploy function-name
```

#### 2. "UUID extension does not exist" Error
```sql
-- Run in Supabase SQL Editor
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

Then update migration files to use `gen_random_uuid()` instead of `uuid_generate_v4()`.

#### 3. "Bucket not found" Error
```sql
-- Create the uploads bucket in Supabase Storage
-- Then set up RLS policies
```

#### 4. SMS/WhatsApp Issues
- Verify Twilio credentials
- Check phone number capabilities
- Ensure geo permissions are enabled
- For WhatsApp: Apply for Business API approval

#### 5. Email Not Sending
- Check Resend/Postmark API key
- Verify domain authentication
- Check Supabase email settings

#### 6. Database Connection Issues
```bash
# Reset and redeploy database
supabase db reset
supabase db push
```

#### 7. Function Timeout
- Check function logs: `supabase functions logs function-name`
- Optimize database queries
- Add proper error handling

### Debug Commands

```bash
# Check Supabase status
supabase status

# View all logs
supabase functions logs --limit 100

# Check database health
supabase db inspect

# Reset everything (development only)
supabase stop
supabase start
```

## Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrations pushed
- [ ] All functions deployed successfully
- [ ] Storage bucket created and configured
- [ ] Email service configured
- [ ] SMS/WhatsApp services configured
- [ ] Authentication working
- [ ] Basic CRUD operations tested
- [ ] Webhooks configured (Chargebee)
- [ ] SSL certificates (if custom domain)
- [ ] Monitoring and alerts set up

## Production Considerations

### Security
- Enable RLS on all tables
- Use service role key only for admin operations
- Implement proper CORS settings
- Regular security audits

### Performance
- Monitor function execution times
- Optimize database queries
- Implement caching where appropriate
- Set up proper indexes

### Monitoring
- Set up error tracking (Sentry, etc.)
- Monitor function logs
- Track API usage
- Set up alerts for failures

### Backup & Recovery
- Regular database backups
- Function versioning
- Rollback procedures
- Disaster recovery plan

## Support

For issues not covered here:
1. Check Supabase documentation: https://supabase.com/docs
2. Review function logs: `supabase functions logs`
3. Check Supabase status page for outages
4. Contact Supabase support for account-specific issues

## Quick Start Commands

```bash
# Complete fresh deployment
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy
supabase status

# Test deployment
curl -X POST https://your-project.supabase.co/functions/v1/signup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"email":"test@example.com","password":"TestPass123!","firstName":"Test","lastName":"User","country":"nigeria"}'