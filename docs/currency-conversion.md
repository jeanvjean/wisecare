# Currency Conversion Edge Function

This document outlines the implementation and integration of the currency conversion logic within the Supabase Edge Function `get-plans` and its display on the `/plans` page of the user portal.

## Overview

The currency conversion feature dynamically adjusts the prices of subscription plans displayed on the `/plans` page based on the user's geographical location. The base currency for all plans is USD, as provided by Chargebee. For users in specific supported regions (UK, US, CA, NG), the prices are converted to their respective local currencies using exchange rates fetched from `currencyapi.com`. For all other regions, prices are displayed in USD.

## Implementation Details

### Supabase Edge Function: `get-plans`

The currency conversion logic is integrated directly into the existing `supabase/functions/get-plans/index.ts` Edge Function.

**Key Changes:**

1.  **Environment Variables:**
    *   `CHARGEBEE_SITE`: Chargebee site name.
    *   `CHARGEBEE_API_KEY`: Chargebee API key.
    *   `CURRENCY_API_KEY`: API key for `currencyapi.com`. This needs to be set in the Supabase project settings.

2.  **Supported Currencies:**
    A `SUPPORTED_CURRENCIES` object maps country codes to their respective local currency codes:
    ```typescript
    const SUPPORTED_CURRENCIES: { [key: string]: string } = {
      GB: 'GBP', // United Kingdom
      US: 'USD', // United States
      CA: 'CAD', // Canada
      NG: 'NGN', // Nigeria
    }
    ```

3.  **Geo-location Detection:**
    The user's country code is detected on the client-side using the `ipapi.co` API and passed as a query parameter (`?country=XX`) to the edge function. If client-side detection fails, it defaults to 'US'. The edge function also supports fallback detection from `x-vercel-ip-country` or `x-supabase-edge-ip-country` request headers.

4.  **Currency Conversion Logic:**
    *   After fetching the plans from Chargebee, the function checks if the user's detected country has a supported currency and if the `CURRENCY_API_KEY` is available.
    *   If conversion is required, it makes a request to `https://api.currencyapi.com/v3/latest` to fetch the exchange rate from USD to the target local currency.
    *   The `price` of each plan is then converted using the fetched exchange rate, and the `currency` field is updated. Prices are rounded to two decimal places.
    *   In case of an error during the currency API call or if the exchange rate is not found, the original USD prices are returned as a fallback.

### User Portal: `/plans` Page

The `apps/user-portal/src/pages/PlanSelection.tsx` component detects the user's country on the client-side and passes it to the edge function.

**Key Changes:**

1.  **Client-side Geo-location Detection:**
    On component mount, the app detects the user's country using the `ipapi.co` API:
    ```typescript
    useEffect(() => {
      const detectCountry = async () => {
        try {
          const response = await fetch('https://ipapi.co/json/')
          if (response.ok) {
            const data = await response.json()
            const detectedCountry = data.country_code || 'US'
            setCountryCode(detectedCountry)
          }
        } catch (error) {
          console.error('Error detecting country:', error)
          setCountryCode('US')
        }
      }
      detectCountry()
    }, [])
    ```

2.  **Passing Country Code to Edge Function:**
    The detected country code is passed as a query parameter:
    ```typescript
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-plans?country=${countryCode}`, {
      // ...
    })
    ```

3.  **Display of Currency:**
    The JSX rendering of the plan price uses `Intl.NumberFormat` for proper currency formatting:
    ```typescript
    {new Intl.NumberFormat(navigator.language, { style: 'currency', currency: plan.currency }).format(plan.price)}
    <span className="text-lg font-normal text-gray-600">/{plan.period_unit.toLowerCase()}</span>
    ```

## Setup and Configuration

1.  **Supabase Environment Variables:**
    Ensure the `CURRENCY_API_KEY` is set as an environment variable in your Supabase project settings.

2.  **Local Development:**
    For local development, add `VITE_CURRENCY_API_KEY="YOUR_CURRENCY_API_KEY_HERE"` to your `apps/user-portal/.env` file. Replace `"YOUR_CURRENCY_API_KEY_HERE"` with your actual API key from `currencyapi.com`.

## Testing

To test the currency conversion:

1.  Deploy the updated `get-plans` Edge Function to Supabase.
2.  Set the `CURRENCY_API_KEY` in your Supabase project.
3.  Access the `/plans` page from different locations (or use a VPN to simulate different countries).
4.  Check the browser console to see the detected country code.
5.  Verify that prices are correctly converted for supported countries (UK, US, CA, NG) and remain in USD for unsupported countries.
6.  You can also manually test by adding `?country=NG` (or GB, CA, US) to the URL to override the detected country.