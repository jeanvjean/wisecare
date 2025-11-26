/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="deno.ns" />
import { sendMail } from '../_lib/email.ts'; // Import the existing email function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'; // Import Supabase client

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; // Use service role for RLS bypass

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const { to, subject, userName, countryState } = await req.json();

    if (!to || !subject || !userName || !countryState) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, userName, countryState' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE); // Use service role for database updates
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // Fetch existing profile to update
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('inform_me_of_countries')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return new Response(JSON.stringify({ error: 'Failed to fetch user profile' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    let updatedCountries = profileData.inform_me_of_countries || [];
    if (!updatedCountries.includes(countryState)) {
      updatedCountries.push(countryState);
    }

    // Update the profiles table
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        inform_me_of_countries: updatedCountries,
        inform_me_status: true,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update user profile' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    let emailHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link
      href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@100;200;300;400;500;600;700;800;900&display=swap"
      rel="stylesheet"
    />

    <title>WiseCare</title>
    <style>
      body {
        font-family: "work sans", sans-serif;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <div style="text-align: center; margin-top: 24px">
      <div>
        <img src="https://api.wisecare.co/storage/v1/object/public/uploads/Logo.png" alt="WiseCare Logo" />
        <h6 style="margin-top: 34px; font-weight: 700; font-size: 16px">
          Hi {{UserName}},
        </h6>
        <p style="font-size: 16px; color: #000000; font-weight: 400">
          Thank you for your interest in WiseCare!
        </p>

        <p
          style="
            font-size: 16px;
            color: #000000;
            font-weight: 400;
            line-height: 40px;
            margin-top: 60px;
            margin-bottom: 60px;
          "
        >
          We’re not live in {{Country/State}} just yet — but we’re working hard
          to bring <br />
          our borderless care to your region.
        </p>
        <p
          style="
            font-size: 16px;
            color: #000000;
            font-weight: 400;
            line-height: 40px;
            margin-top: 60px;
            margin-bottom: 60px;
          "
        >
          You’re now on our priority list, and we’ll notify you the moment
          <br />
          WiseCare launches where you are.
        </p>
        <p
          style="
            font-size: 16px;
            color: #000000;
            font-weight: 400;
            line-height: 40px;
            margin-top: 60px;
          "
        >
          We can’t wait to serve you soon. 💙
        </p>

        <div
          style="
            background-color: #000000;
            padding: 49px 38px;
            margin-top: 31px;
            text-align: center;
            color: white;
            font-size: 13px;
            height: 270px;
            display: flex;
          "
        >
          <div style="width: 650px; margin: auto">
            <p>Care for your loved ones, from anywhere in the world.</p>
            <p>
              <a
                href="https://wisecare.co"
                target="_blank"
                rel="noopener noreferrer"
                style="text-decoration: none; color: white"
                >🌍Visit Website</a
              >
              |
              <a
                href="mailto:support@wisecare.co"
                target="_blank"
                rel="noopener noreferrer"
                style="text-decoration: none; color: white"
                >✉️ Get Support</a
              >
            </p>
            <p style="margin-top: 15px; margin-bottom: 15px">
              You’re receiving this email because you have a WiseCare account or
              were added as a beneficiary. If you’d prefer not to receive these
              notifications,
            </p>
            <p>Registered in England & Wales | Company No. 16613659</p>
            <div
              style="
                display: flex;
                gap: 40px;
                justify-content: center;
                margin-top: 22px;
              "
            >
              <a href="http://" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; justify-content: center;">
                <img src="https://api.wisecare.co/storage/v1/object/public/uploads/001-facebook.png" alt="" style="width: 24px; height: 24px; object-fit: contain;">
              </a>
              <a href="http://" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; justify-content: center;">
                <img src="https://api.wisecare.co/storage/v1/object/public/uploads/003-twitter.png" alt="" style="width: 24px; height: 24px; object-fit: contain;">
              </a>
              <a href="http://" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; justify-content: center;">
                <img src="https://api.wisecare.co/storage/v1/object/public/uploads/Instagram.png" alt="" style="width: 24px; height: 24px; object-fit: contain;">
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;

    emailHtml = emailHtml.replace('{{UserName}}', userName);
    emailHtml = emailHtml.replace('{{Country/State}}', countryState);

    const mailResult = await sendMail({
      to: to,
      subject: subject,
      text: '',
      html: emailHtml,
    });

    if (mailResult.rejected.length > 0) {
      console.error('Failed to send email to:', mailResult.rejected);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    return new Response(JSON.stringify({ success: true, accepted: mailResult.accepted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (error) {
    console.error('Email function error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
});
