# Public Deployment Guide

This makes ClipCut accessible on the public internet. Payments can stay in sandbox or be ignored until later.

## Recommended Host: Render

1. Create a GitHub repo for `C:\Users\binih\clipcut`.
2. Go to https://render.com
3. New → Blueprint
4. Connect the repo.
5. Render will read `render.yaml`.
6. Add environment variables when Render asks.

## Required Environment Variables

Use the same values from local `.env`, but do not upload `.env` itself.

Minimum for public editor + accounts:

```env
APP_URL=https://YOUR-RENDER-URL.onrender.com
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_PASSWORD=...
ADMIN_COOKIE_SECRET=long-random-string
```

Optional for PayPal later:

```env
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=
PAYPAL_PLAN_WEEKLY=
```

## Supabase Settings

In Supabase → Authentication → URL Configuration:

```text
Site URL: https://YOUR-RENDER-URL.onrender.com
Redirect URLs: https://YOUR-RENDER-URL.onrender.com
```

## Start Command

Render runs:

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

## After Deploy

Open the Render URL. The editor should be public. Accounts should work if Supabase Email auth is enabled. Downloads/admin/payment behavior depends on the environment variables you set.

## Custom Domain Later

When you buy/use a domain, add it in Render → Settings → Custom Domains, then update:

- `APP_URL`
- Supabase Site URL
- Supabase Redirect URLs
- PayPal webhook URL later
