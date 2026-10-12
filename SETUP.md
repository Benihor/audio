# ClipCut payments setup

Audio editing stays in the browser. This server only handles accounts, PayPal, and whether a download is allowed.

## 1. Supabase

1. Create a project at https://supabase.com
2. SQL editor → paste and run `supabase/schema.sql`
3. Authentication → Providers → Email: enable email/password
4. Copy from **Project Settings → API**:
   - Project URL → `SUPABASE_URL`
   - `anon` `public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
   - JWT Secret → `SUPABASE_JWT_SECRET`

## 2. PayPal

1. Use a PayPal Business account.
2. Go to https://developer.paypal.com → **Apps & Credentials**.
3. Start with **Sandbox**.
4. Create an app and copy:
   - Client ID → `PAYPAL_CLIENT_ID`
   - Secret → `PAYPAL_CLIENT_SECRET`
5. Set:

```env
PAYPAL_MODE=sandbox
```

The server creates:

- **$1.50** one-time download order
- **$3.50 / week** subscription plan, unlimited downloads until canceled

After the first weekly subscription checkout, the server prints `Created PAYPAL_PLAN_WEEKLY=...`.
Paste that value into `.env` so the same plan is reused.

### PayPal Webhook

For public launch, create a PayPal webhook for:

```text
https://yourdomain.com/api/paypal/webhook
```

Listen for:

- `CHECKOUT.ORDER.COMPLETED`
- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.UPDATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`

Copy the webhook id into:

```env
PAYPAL_WEBHOOK_ID=...
```

## 3. Admin bypass

Set `ADMIN_PASSWORD` in `.env`. In the paywall, under **Admin bypass**, enter that password. Downloads then skip payment (cookie for 30 days; if you are signed in, your profile is marked admin).

Also set a long random `ADMIN_COOKIE_SECRET`.

## 4. Run

```bash
cd C:\Users\binih\clipcut
copy .env.example .env
# edit .env

python -m pip install -r backend\requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765
```

Open http://127.0.0.1:8765/  (this app replaces `python -m http.server`)

## 5. Flow

1. User edits audio in the browser (unchanged)
2. Download → sign in → pay **$1.50** (one file) or **$3.50 / 7 days unlimited**
3. PayPal return/webhook marks the user paid in Supabase
4. The file downloads from the browser; audio never goes to your server
