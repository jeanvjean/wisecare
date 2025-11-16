// @ts-nocheck
// Edge function: activate-beneficiaries
// Scheduled job to activate beneficiaries after 48 hours

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, authorization, x-client-info, apikey, content-type'
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

    // Call the database function to activate expired beneficiaries
    const { data, error } = await supabase
      .rpc('activate_expired_beneficiaries')

    if (error) {
      console.error('Error activating beneficiaries:', error)
      return new Response(JSON.stringify({ 
        error: 'Failed to activate beneficiaries',
        details: error.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      })
    }

    const activatedCount = data || 0
    console.log(`Activated ${activatedCount} beneficiaries`)

    return new Response(JSON.stringify({ 
      success: true,
      activated_count: activatedCount,
      message: `Successfully activated ${activatedCount} beneficiaries`
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  } catch (e) {
    console.error('Unhandled error in activate-beneficiaries:', e)
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      details: String((e && e.message) || e) 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    })
  }
})