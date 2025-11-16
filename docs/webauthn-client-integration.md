# WebAuthn Client-Side Integration Guide

This document outlines the client-side integration steps for WebAuthn (biometric authentication) within the WiseCare user portal. It assumes that the server-side Supabase Edge Functions (`webauthn-register` and `webauthn-authenticate`) are already deployed and configured.

## 1. Overview of WebAuthn

WebAuthn (Web Authentication API) is a web standard published by the W3C and FIDO Alliance. It enables web applications to integrate strong, phishing-resistant authentication using public-key cryptography, often leveraging built-in authenticators like fingerprint sensors (Touch ID), facial recognition (Face ID), or security keys.

**Benefits:**
-   **Enhanced Security:** Replaces passwords with cryptographic keys, making phishing and credential stuffing attacks much harder.
-   **Improved User Experience:** Users can authenticate with a simple touch or glance, eliminating the need to remember complex passwords.
-   **Platform Authenticator Preference:** Configured to prioritize platform-specific biometrics (Face ID, Touch ID, Android Biometrics) over cross-device QR code flows.

## 2. Prerequisites

Before integrating WebAuthn on the client-side, ensure the following server-side components are in place:

-   **Supabase Project:** Your project must be set up with Supabase Authentication.
-   **`webauthn-register` Edge Function:** This function handles the generation of registration options and the verification/storage of new WebAuthn credentials.
    -   It uses `@simplewebauthn/server` to generate options and verify responses.
    -   It stores credential information (ID, public key, counter, transports) in a `user_webauthn_credentials` table in your Supabase database.
    -   It ensures `userID` is a `Uint8Array` for `simplewebauthn` and converts `credentialID` to a base64url string for storage.
-   **`webauthn-authenticate` Edge Function:** This function handles the generation of authentication options and the verification of assertion responses.
    -   It retrieves stored credentials for a user.
    -   It generates a challenge and stores it in user metadata for verification.
    -   It verifies the assertion response from the client.
    -   It generates a magic link token for session establishment upon successful authentication.
-   **Database Schema:** A `user_webauthn_credentials` table (or similar) to store WebAuthn public key credentials linked to user IDs.

## 3. Client-Side Integration (`apps/user-portal/src/store/auth.ts`)

The core WebAuthn logic on the client-side resides within the `useAuthStore` (Zustand store) in `apps/user-portal/src/store/auth.ts`.

### Helper Functions

A common pattern in WebAuthn is converting `ArrayBuffer` to base64url strings and vice-versa. While `simplewebauthn` handles much of this on the server, the client still needs to perform some conversions.

```typescript
// Helper to convert ArrayBuffer to base64url string
const toBase64URL = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

// Helper to convert base64url string to Uint8Array
const fromBase64URL = (str: string) =>
  Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
```

### 3.1. WebAuthn Registration (`registerWebAuthn`)

This function initiates the process of registering a new biometric credential for the currently logged-in user.

```typescript
// apps/user-portal/src/store/auth.ts
registerWebAuthn: async () => {
  set({ loading: true });
  try {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) throw new Error('No active session');

    // 1. Get registration options from the server
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webauthn-register`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get registration options: ${text}`);
    }
    const options = await response.json();

    // Validate options
    if (!options.challenge || !options.user || !options.user.id) {
      throw new Error('Invalid registration options received from server');
    }

    // 2. Convert challenge and user.id to Uint8Array (required by WebAuthn API)
    options.challenge = fromBase64URL(options.challenge);
    options.user.id = new TextEncoder().encode(options.user.id); // Ensure user.id is Uint8Array

    // 3. Create credential using WebAuthn API
    const credential = await navigator.credentials.create({
      publicKey: options,
      mediation: 'required' // Crucial for prompting platform biometrics
    }) as PublicKeyCredential;
    if (!credential) throw new Error('Registration cancelled');

    // 4. Prepare credential for server (convert ArrayBuffers to base64url strings)
    const credentialData = {
      id: credential.id,
      rawId: toBase64URL(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: toBase64URL((credential.response as AuthenticatorAttestationResponse).clientDataJSON),
        attestationObject: toBase64URL((credential.response as AuthenticatorAttestationResponse).attestationObject),
        transports: (credential.response as AuthenticatorAttestationResponse).getTransports ? (credential.response as AuthenticatorAttestationResponse).getTransports()! : []
      }
    };

    // 5. Send credential to server for verification and storage
    const registerResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webauthn-register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ credential: credentialData })
    });
    if (!registerResponse.ok) {
      const text = await registerResponse.text();
      throw new Error(`Registration failed: ${text}`);
    }
    const result = await registerResponse.json();
    console.log('WebAuthn Registration successful:', result);
  } finally {
    set({ loading: false });
  }
},
```

**Key Points for Registration:**
-   **`mediation: 'required'`**: This property in `navigator.credentials.create()` is vital. It instructs the browser to prefer platform authenticators (e.g., Face ID, Touch ID) and will typically prevent the display of a QR code for cross-device authentication.
-   **Data Type Conversions**: `options.challenge` and `options.user.id` must be `Uint8Array` before passing to `navigator.credentials.create()`. Similarly, `credential.rawId`, `clientDataJSON`, and `attestationObject` (which are `ArrayBuffer`s) must be converted to base64url strings before sending to the server.
-   **`Authorization` Header**: The user's `access_token` is sent to authorize the registration request.

### 3.2. WebAuthn Authentication (`signInWithWebAuthn`)

This function handles the process of authenticating a user using a previously registered biometric credential.

```typescript
// apps/user-portal/src/store/auth.ts
signInWithWebAuthn: async (email) => {
  set({ loading: true });
  try {
    // 1. Get assertion options from the server
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webauthn-authenticate/options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` // Using anon key for initial options request
      },
      body: JSON.stringify({ email })
    });
    if (!response.ok) throw new Error('Failed to get assertion options');
    const options = await response.json();

    // 2. Convert challenge and allowCredentials IDs to Uint8Array
    options.challenge = fromBase64URL(options.challenge);
    // Conditionally process allowCredentials if present, otherwise omit to enable discoverable credentials
    if (options.allowCredentials && Array.isArray(options.allowCredentials) && options.allowCredentials.length) {
      options.allowCredentials = options.allowCredentials.map((cred: any) => ({
        ...cred,
        id: fromBase64URL(cred.id)
      }));
    } else {
      delete options.allowCredentials; // Omit to allow discoverable credentials (passkeys)
    }

    // 3. Get assertion using WebAuthn API
    const assertion = await navigator.credentials.get({
      publicKey: options,
      mediation: 'required' // Crucial for prompting platform biometrics
    }) as PublicKeyCredential;
    if (!assertion) throw new Error('Authentication cancelled');

    // 4. Prepare assertion for server (convert ArrayBuffers to base64url strings)
    const assertionData = {
      id: assertion.id,
      rawId: toBase64URL(assertion.rawId),
      type: assertion.type,
      response: {
        clientDataJSON: toBase64URL((assertion.response as AuthenticatorAssertionResponse).clientDataJSON),
        authenticatorData: toBase64URL((assertion.response as AuthenticatorAssertionResponse).authenticatorData),
        signature: toBase64URL((assertion.response as AuthenticatorAssertionResponse).signature),
        userHandle: (assertion.response as AuthenticatorAssertionResponse).userHandle ? toBase64URL((assertion.response as AuthenticatorAssertionResponse).userHandle!) : null
      }
    };

    // 5. Send assertion to server for verification
    const verifyResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webauthn-authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` // Using anon key for verification request
      },
      body: JSON.stringify({ email, assertion: assertionData })
    });
    if (!verifyResponse.ok) throw new Error('Authentication failed');
    const responseData = await verifyResponse.json();
    const { token } = responseData;

    // 6. Use the magic link token to establish a Supabase session
    if (!token || typeof token !== 'string' || token.trim() === '') {
      throw new Error('Authentication token is missing or invalid from server response.');
    }
    const { error } = await supabase.auth.verifyOtp({
      token_hash: token, // Server returns 'hashed_token'
      type: 'magiclink'
    });
    if (error) throw error;
  } finally {
    set({ loading: false });
  }
},
```

**Key Points for Authentication:**
-   **`mediation: 'required'`**: Similar to registration, this ensures the browser prompts for platform biometrics.
-   **Omitting `allowCredentials`**: If the server doesn't provide `allowCredentials` (which is the case when using discoverable credentials/passkeys), the client should omit this property from the `publicKey` options passed to `navigator.credentials.get()`. This allows the browser to perform on-device account discovery and present the appropriate biometric prompt.
-   **Data Type Conversions**: `options.challenge` and `options.allowCredentials[].id` must be `Uint8Array`. `assertion.rawId`, `clientDataJSON`, `authenticatorData`, `signature`, and `userHandle` must be converted to base64url strings before sending to the server.
-   **Session Establishment**: Upon successful verification by the server, a magic link token is returned. This token is then used with `supabase.auth.verifyOtp({ token_hash: token, type: 'magiclink' })` to establish the user's session.

## 4. Important Considerations

-   **HTTPS/Localhost**: WebAuthn requires a secure context. This means your application must be served over HTTPS or `localhost`.
-   **User Experience**: Provide clear instructions and feedback to users during the registration and authentication flows.
-   **Error Handling**: Implement robust error handling for all WebAuthn operations, both client-side and server-side.
-   **Browser/OS Support**: WebAuthn support varies across browsers and operating systems. Ensure your users are aware of the requirements.
-   **Credential Management**: Consider how users will manage their WebAuthn credentials (e.g., removing old ones, adding new ones).