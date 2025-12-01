// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const body = await req.json()
    const {
      userId,
      carePreference,
      mattersMost,
      ageRanges,
      fundingFrequency,
      lovedOnesCountries,
      lovedOnesCities,
      numberOfLovedOnes,
      paymentFrequency
    } = body

    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // 1. Upsert into user_onboarding table
    const { error: onboardingError } = await admin.from('user_onboarding').upsert({
      user_id: userId,
      care_preference: carePreference,
      matters_most: mattersMost,
      age_ranges: ageRanges,
      funding_frequency: fundingFrequency,
      payment_frequency: paymentFrequency,
      number_of_loved_ones: numberOfLovedOnes
    })

    if (onboardingError) {
      console.error('Error upserting user_onboarding:', onboardingError)
      return new Response(JSON.stringify({ error: onboardingError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // 2. Save countries - map full country names to ISO codes
    await admin.from('user_loved_ones_countries').delete().eq('user_id', userId)

    // Simple mapping of common country names to ISO codes
    const countryNameToCode: { [key: string]: string } = {
      'Afghanistan': 'AF',
      'Albania': 'AL',
      'Algeria': 'DZ',
      'Argentina': 'AR',
      'Australia': 'AU',
      'Austria': 'AT',
      'Bangladesh': 'BD',
      'Belgium': 'BE',
      'Brazil': 'BR',
      'Bulgaria': 'BG',
      'Canada': 'CA',
      'Chile': 'CL',
      'China': 'CN',
      'Colombia': 'CO',
      'Croatia': 'HR',
      'Czech Republic': 'CZ',
      'Denmark': 'DK',
      'Egypt': 'EG',
      'Finland': 'FI',
      'France': 'FR',
      'Germany': 'DE',
      'Greece': 'GR',
      'Hungary': 'HU',
      'Iceland': 'IS',
      'India': 'IN',
      'Indonesia': 'ID',
      'Ireland': 'IE',
      'Israel': 'IL',
      'Italy': 'IT',
      'Japan': 'JP',
      'Jordan': 'JO',
      'Kenya': 'KE',
      'South Korea': 'KR',
      'Lebanon': 'LB',
      'Malaysia': 'MY',
      'Mexico': 'MX',
      'Morocco': 'MA',
      'Netherlands': 'NL',
      'New Zealand': 'NZ',
      'Nigeria': 'NG',
      'Norway': 'NO',
      'Pakistan': 'PK',
      'Peru': 'PE',
      'Philippines': 'PH',
      'Poland': 'PL',
      'Portugal': 'PT',
      'Romania': 'RO',
      'Russia': 'RU',
      'Saudi Arabia': 'SA',
      'Singapore': 'SG',
      'South Africa': 'ZA',
      'Spain': 'ES',
      'Sweden': 'SE',
      'Switzerland': 'CH',
      'Thailand': 'TH',
      'Turkey': 'TR',
      'Ukraine': 'UA',
      'United Arab Emirates': 'AE',
      'United Kingdom': 'GB',
      'United States': 'US',
      'Vietnam': 'VN',
      // Add more mappings as needed
    }

    for (const country of lovedOnesCountries) {
      const countryCode = countryNameToCode[country] || country // fallback to original if not found
      if (countryCode !== country) { // Only insert if we have a valid mapping
        const { error: countryInsertError } = await admin.from('user_loved_ones_countries').insert({
          user_id: userId,
          country_code: countryCode
        })
        if (countryInsertError) console.error('Error inserting loved one country:', countryInsertError)
      } else {
        console.warn(`No country code mapping found for: ${country}`)
      }
    }

    // 3. Save cities
    await admin.from('user_loved_ones_cities').delete().eq('user_id', userId)
    for (const city of lovedOnesCities) {
      const { error: cityInsertError } = await admin.from('user_loved_ones_cities').insert({
        user_id: userId,
        city_id: city // Assuming city_id is the actual city name or a lookup ID
      })
      if (cityInsertError) console.error('Error inserting loved one city:', cityInsertError)
    }

    // 4. Mark onboarding completed in profiles table
    const { data: profileData, error: profileUpdateError } = await admin
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', userId)
      .select()
      .single()

    if (profileUpdateError) {
      console.error('Error updating onboarding status in profiles:', profileUpdateError)
      return new Response(JSON.stringify({ error: profileUpdateError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    // 5. Update auth.users metadata for consistency
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        onboarding_completed: true,
      },
    });

    if (authUpdateError) {
      console.error('Error updating auth.users metadata for onboarding:', authUpdateError)
      // Log the error but don't fail the main response
    }

    return new Response(JSON.stringify({ message: 'Onboarding completed successfully', profile: profileData }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })

  } catch (e) {
    console.error('complete-onboarding error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: 'Internal error', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})