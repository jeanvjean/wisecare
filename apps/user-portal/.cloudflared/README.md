# Cloudflared tunnel for User Portal

This folder contains the Cloudflare Tunnel configuration for the User Portal.

Public hostname: `app.wisecare.co` -> Local origin: `http://localhost:3000`

Quick steps to run locally

1. Install `cloudflared` and authenticate with your Cloudflare account.
2. Create a tunnel (if you haven't):

   cloudflared tunnel create user-portal

   Note the tunnel name (e.g. `user-portal`) and the generated credentials file path (e.g. `C:\Users\you\.cloudflared\<TUNNEL-UUID>.json`).

3. Update `config.yml` replacing `<TUNNEL-UUID>` and credentials-file path with your values.

4. Run the tunnel (example):

   cloudflared tunnel --config ".cloudflared/config.yml" run user-portal

Tips

- If you want to run the dev server + tunnel together, use the `dev:with-tunnel` script at the `apps/user-portal` package (it uses `concurrently`).
- If you prefer not to install `concurrently`, run the dev server and tunnel in separate terminals.
