// supabase/functions/_lib/sms.ts
// SMS utility for Supabase edge functions (Deno) using Twilio API

// Country codes configuration
const COUNTRY_CODES = {
  nigeria: '+234',
  united_kingdom: '+44',
  united_states: '+1',
  canada: '+1'
} as const

type CountryCode = typeof COUNTRY_CODES[keyof typeof COUNTRY_CODES]

// Sender phone numbers configuration for different countries
// For production: Replace with purchased Twilio numbers
// For trial: Use verified numbers or upgrade to paid account
const SENDER_PHONE_NUMBERS = {
  nigeria: Deno.env.get('TWILIO_ALPHA_NUMERIC_SENDER'), // Alphanumeric sender ID (supported in Nigeria)
  ng: Deno.env.get('TWILIO_ALPHA_NUMERIC_SENDER'), // Alphanumeric sender ID (supported in Nigeria)
  united_kingdom: Deno.env.get('TWILIO_ALPHA_NUMERIC_SENDER'), // Alphanumeric sender ID (supported in UK)
  gb: Deno.env.get('TWILIO_ALPHA_NUMERIC_SENDER'), // Alphanumeric sender ID (supported in UK)
  united_states: Deno.env.get('TWILIO_PHONE_NUMBER'), // Phone number required in US
  us: Deno.env.get('TWILIO_PHONE_NUMBER'), // Phone number required in US
  canada: Deno.env.get('TWILIO_PHONE_NUMBER'), // Phone number required in Canada
  ca: Deno.env.get('TWILIO_PHONE_NUMBER') // Phone number required in Canada
} as const

type SenderPhoneNumber = typeof SENDER_PHONE_NUMBERS[keyof typeof SENDER_PHONE_NUMBERS]

// Twilio configuration
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')
const TWILIO_MESSAGING_SERVICE_SID = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID')

/**
 * Format phone number to international format based on country
 * @param {string} phoneNumber - Phone number to format
 * @param {string} country - Country name ('nigeria', 'united_kingdom', 'united_states', 'canada')
 * @returns {string} - Formatted phone number
 */
export function formatPhoneNumber(phoneNumber: string, country?: string): string {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '')
  
  // If already has international format
  if (phoneNumber.startsWith('+')) {
    return phoneNumber
  }
  
  // If country is provided, use its country code
  if (country && COUNTRY_CODES[country as keyof typeof COUNTRY_CODES]) {
    const countryCode = COUNTRY_CODES[country as keyof typeof COUNTRY_CODES]
    return `${countryCode}${digits}`
  }
  
  // Handle 10-digit numbers (US/Canada)
  if (digits.length === 10) {
    return `+1${digits}`
  }
  
  // Handle 11-digit numbers starting with 1 (US/Canada)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }
  
  // Handle Nigerian 10-digit numbers
  if (digits.length === 10 && digits.startsWith('0')) {
    return `+234${digits.substring(1)}`
  }
  
  // Handle UK 11-digit numbers starting with 0
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+44${digits.substring(1)}`
  }
  
  // Default: assume +1 for North American numbers
  if (digits.length === 10) {
    return `+1${digits}`
  }
  
  // If all else fails, just prepend +1
  return `+${digits}`
}

/**
 * Send SMS using Twilio API
 * @param {Object} options - SMS options
 * @param {string} options.to - Recipient phone number
 * @param {string} options.message - SMS message content
 * @param {string} options.country - Country of the recipient (optional, used to select sender when not using messaging service)
 * @returns {Promise<Object>} - Response with accepted/rejected arrays
 */
export async function sendSMS({ to, message, country }: { to: string; message: string; country?: string }) {
  console.log('sendSMS called with:', {
    to,
    message: message?.substring(0, 50) + (message?.length > 50 ? '...' : ''),
    hasAccountSid: !!TWILIO_ACCOUNT_SID,
    hasAuthToken: !!TWILIO_AUTH_TOKEN,
    hasMessagingService: !!TWILIO_MESSAGING_SERVICE_SID,
    hasPhoneNumber: !!TWILIO_PHONE_NUMBER,
    country,
  })

  // Validate required parameters
  if (!to || !message) {
    console.error('Missing required SMS parameters. Both "to" and "message" are required.')
    return { accepted: [], rejected: [to || 'unknown'] }
  }

  // Check Twilio credentials
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error('Missing Twilio credentials. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.')
    // Fallback to console logging for development
    console.log('SMS not sent; logging to console instead')
    console.log(`SMS (console) -> To: ${to} | Message: ${message}`)
    return { accepted: [], rejected: [to] }
  }

  if (!TWILIO_MESSAGING_SERVICE_SID && !TWILIO_PHONE_NUMBER) {
    console.error('Missing sender configuration. Set either TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER environment variable.')
    // Fallback to console logging for development
    console.log('SMS not sent; logging to console instead')
    console.log(`SMS (console) -> To: ${to} | Message: ${message}`)
    return { accepted: [], rejected: [to] }
  }

  try {
    console.log('Attempting to send SMS via Twilio API...')

    // Create Twilio API request
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`

    const body = new URLSearchParams({
      To: to,
      Body: message
    })

    // Use Messaging Service if configured, otherwise use phone number
    if (TWILIO_MESSAGING_SERVICE_SID) {
      body.append('MessagingServiceSid', TWILIO_MESSAGING_SERVICE_SID)
      console.log('Using Messaging Service:', TWILIO_MESSAGING_SERVICE_SID)
    } else {
      const fromNumber = country && SENDER_PHONE_NUMBERS[country as keyof typeof SENDER_PHONE_NUMBERS] || TWILIO_PHONE_NUMBER
      body.append('From', fromNumber)
      console.log({ fromNumber, country })
    }

    // Create authorization header
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

    // Make request to Twilio API
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(`Twilio API error: ${response.status} - ${result.message || 'Unknown error'}`)
    }

    console.log('SMS sent successfully via Twilio:', result.sid)
    return { 
      accepted: [to], 
      rejected: [],
      messageId: result.sid,
      status: result.status
    }
  } catch (err) {
    console.error('Twilio API failed with error:', err)
    console.error('Error details:', JSON.stringify(err, null, 2))
    
    // Fallback to console logging for development
    console.log('SMS not sent; logging to console instead')
    console.log(`SMS (console) -> To: ${to} | Message: ${message}`)
    return { accepted: [], rejected: [to] }
  }
}

/**
 * Send SMS to multiple recipients
 * @param {Object} options - SMS options
 * @param {string[]} options.to - Array of recipient phone numbers
 * @param {string} options.message - SMS message content
 * @returns {Promise<Object>} - Response with accepted/rejected arrays
 */
export async function sendBulkSMS({ to, message }: { to: string[]; message: string }) {
  if (!Array.isArray(to)) {
    console.error('sendBulkSMS expects "to" to be an array of phone numbers')
    return { accepted: [], rejected: to ? [to] : ['unknown'] }
  }

  const results = await Promise.allSettled(
    to.map(phoneNumber => sendSMS({ to: phoneNumber, message }))
  )

  const accepted: string[] = []
  const rejected: string[] = []

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.accepted.length > 0) {
      accepted.push(to[index])
    } else {
      rejected.push(to[index])
    }
  })

  return { accepted, rejected }
}

/**
 * Get supported countries for phone number formatting
 * @returns {string[]} - Array of supported country names
 */
export function getSupportedCountries(): string[] {
  return Object.keys(COUNTRY_CODES)
}

export default {
  sendSMS,
  sendBulkSMS,
  formatPhoneNumber,
  getSupportedCountries,
  COUNTRY_CODES,
  SENDER_PHONE_NUMBERS
}