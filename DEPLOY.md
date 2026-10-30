# Public Deployment Guide

ClipCut: edit free in the browser. Download costs **$2.50** via PayPal. No login / no database.

## Vercel

1. Import `Benihor/audio`.
2. Root Directory: **`backend`**
3. Set env vars (below), then deploy.
4. Domain: `https://www.audioeditscuts.com`

## Required Environment Variables

```env
APP_URL=https://www.audioeditscuts.com
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
ADMIN_PASSWORD=...
ADMIN_COOKIE_SECRET=long-random-string
```

## Live PayPal setup

1. Go to https://developer.paypal.com/dashboard/
2. Log in with the PayPal account that should receive money.
3. Open **Apps & Credentials**.
4. Switch the toggle from **Sandbox** to **Live**.
5. Under **REST API apps**, create an app (or open an existing Live app) named ClipCut.
6. Copy **Client ID** and **Secret** (Live).
7. In Vercel → Environment Variables, set:
   - `PAYPAL_MODE=live`
   - `PAYPAL_CLIENT_ID=` (Live Client ID)
   - `PAYPAL_CLIENT_SECRET=` (Live Secret)
   - `APP_URL=https://www.audioeditscuts.com`
8. Redeploy the project.
9. Test a real $2.50 payment (or a small refund afterward).

Your Live app must be under a PayPal account that can accept business payments. If Live credentials are missing, finish PayPal business verification first.

## How payment works

1. User edits audio (free).
2. Clicks Download → PayPal $2.50.
3. After PayPal returns, the site unlocks **one** download (browser cookie, 24h).
4. No accounts.

## Admin

Set `ADMIN_PASSWORD` and use **Unlock as admin** on the paywall for free downloads while testing.
