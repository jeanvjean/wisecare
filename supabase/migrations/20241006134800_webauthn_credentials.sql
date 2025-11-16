-- WebAuthn credentials table for biometric authentication
CREATE TABLE user_webauthn_credentials (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key JSONB NOT NULL,
  counter BIGINT DEFAULT 0,
  transports TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own credentials
CREATE POLICY "Users can view their own WebAuthn credentials" ON user_webauthn_credentials
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own WebAuthn credentials" ON user_webauthn_credentials
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own WebAuthn credentials" ON user_webauthn_credentials
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own WebAuthn credentials" ON user_webauthn_credentials
  FOR DELETE USING (auth.uid() = user_id);

-- Index for performance
CREATE INDEX idx_user_webauthn_credentials_user_id ON user_webauthn_credentials(user_id);
CREATE INDEX idx_user_webauthn_credentials_credential_id ON user_webauthn_credentials(credential_id);