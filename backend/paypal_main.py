import hmac
import hashlib
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from fastapi import Cookie, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel

HERE = Path(__file__).resolve().parent
# Repo root (local/Render) or `backend` itself (Vercel Root Directory = backend).
if (HERE / "public").is_dir() or (HERE / "index.html").is_file():
    ROOT = HERE
elif (HERE.parent / "public").is_dir() or (HERE.parent / "index.html").is_file():
    ROOT = HERE.parent
else:
    ROOT = HERE.parent
load_dotenv(ROOT / ".env")
load_dotenv(HERE / ".env")

APP_URL = os.getenv("APP_URL", "http://127.0.0.1:8765").rstrip("/")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()
ADMIN_COOKIE_SECRET = os.getenv("ADMIN_COOKIE_SECRET", "clipcut-admin-secret").strip()
PAYPAL_MODE = os.getenv("PAYPAL_MODE", "sandbox").strip().lower()
PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID", "").strip()
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET", "").strip()
PAYPAL_WEBHOOK_ID = os.getenv("PAYPAL_WEBHOOK_ID", "").strip()
PAYPAL_PLAN_WEEKLY = os.getenv("PAYPAL_PLAN_WEEKLY", "").strip()

SINGLE_CENTS = 150
WEEKLY_CENTS = 350
PAYPAL_BASE = "https://api-m.paypal.com" if PAYPAL_MODE == "live" else "https://api-m.sandbox.paypal.com"
PAYPAL_SITE = "https://www.paypal.com" if PAYPAL_MODE == "live" else "https://www.sandbox.paypal.com"

app = FastAPI(title="ClipCut")


def db() -> Any:
    if not SUPABASE_URL or not SERVICE_KEY:
        raise HTTPException(503, "Supabase is not configured.")
    from supabase import create_client

    return create_client(SUPABASE_URL, SERVICE_KEY)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def next_week_iso() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()


def paypal_ready() -> bool:
    return bool(PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET)


async def paypal_token() -> str:
    if not paypal_ready():
        raise HTTPException(503, "PayPal is not configured.")
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(
            f"{PAYPAL_BASE}/v1/oauth2/token",
            data={"grant_type": "client_credentials"},
            auth=(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET),
            headers={"Accept": "application/json", "Accept-Language": "en_US"},
        )
    if res.status_code >= 400:
        raise HTTPException(502, f"PayPal auth failed: {res.text[:180]}")
    return res.json()["access_token"]


async def paypal_request(method: str, path: str, json_body: Optional[dict] = None) -> dict:
    token = await paypal_token()
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.request(
            method,
            f"{PAYPAL_BASE}{path}",
            json=json_body,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Prefer": "return=representation",
            },
        )
    if res.status_code >= 400:
        raise HTTPException(502, f"PayPal error: {res.text[:240]}")
    return res.json() if res.content else {}


async def paypal_weekly_plan() -> str:
    global PAYPAL_PLAN_WEEKLY
    if PAYPAL_PLAN_WEEKLY:
        return PAYPAL_PLAN_WEEKLY
    product = await paypal_request("POST", "/v1/catalogs/products", {
        "name": "ClipCut",
        "description": "Browser audio editor downloads",
        "type": "SERVICE",
        "category": "SOFTWARE",
    })
    plan = await paypal_request("POST", "/v1/billing/plans", {
        "product_id": product["id"],
        "name": "ClipCut unlimited downloads - weekly",
        "description": "$3.50 every 7 days, unlimited downloads until canceled",
        "status": "ACTIVE",
        "billing_cycles": [{
            "frequency": {"interval_unit": "WEEK", "interval_count": 1},
            "tenure_type": "REGULAR",
            "sequence": 1,
            "total_cycles": 0,
            "pricing_scheme": {"fixed_price": {"value": "3.50", "currency_code": "USD"}},
        }],
        "payment_preferences": {
            "auto_bill_outstanding": True,
            "setup_fee_failure_action": "CONTINUE",
            "payment_failure_threshold": 3,
        },
    })
    PAYPAL_PLAN_WEEKLY = plan["id"]
    print(f"Created PAYPAL_PLAN_WEEKLY={PAYPAL_PLAN_WEEKLY}")
    return PAYPAL_PLAN_WEEKLY


def sign_admin(exp: int) -> str:
    msg = f"1.{exp}"
    sig = hmac.new(ADMIN_COOKIE_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}.{sig}"


def admin_cookie_ok(value: Optional[str]) -> bool:
    if not value or not ADMIN_COOKIE_SECRET:
        return False
    parts = value.split(".")
    if len(parts) != 3:
        return False
    flag, exp, sig = parts
    if flag != "1":
        return False
    try:
        if int(exp) < int(time.time()):
            return False
    except ValueError:
        return False
    expect = hmac.new(ADMIN_COOKIE_SECRET.encode(), f"{flag}.{exp}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expect, sig)


async def current_user(authorization: Optional[str]):
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        return db().auth.get_user(token).user
    except Exception:
        return None


def require_user(user):
    if not user:
        raise HTTPException(401, "Sign in first.")
    return user


def ensure_profile(user):
    client = db()
    found = client.table("profiles").select("*").eq("id", user.id).execute()
    if found.data:
        row = found.data[0]
        if user.email and row.get("email") != user.email:
            client.table("profiles").update({"email": user.email, "updated_at": now_iso()}).eq("id", user.id).execute()
            row["email"] = user.email
        return row
    client.table("profiles").insert({"id": user.id, "email": user.email}).execute()
    return client.table("profiles").select("*").eq("id", user.id).execute().data[0]


def profile_by_user_id(user_id: str):
    if not user_id:
        return None
    found = db().table("profiles").select("*").eq("id", user_id).limit(1).execute()
    return found.data[0] if found.data else None


def profile_by_subscription(sub_id: str):
    if not sub_id:
        return None
    found = db().table("profiles").select("*").eq("stripe_subscription_id", sub_id).limit(1).execute()
    return found.data[0] if found.data else None


def seen_event(event_id: str, event_type: str) -> bool:
    client = db()
    existing = client.table("stripe_events").select("id").eq("id", event_id).execute()
    if existing.data:
        return True
    client.table("stripe_events").insert({"id": event_id, "type": event_type}).execute()
    return False


def entitlement_payload(profile: Optional[dict], is_admin: bool):
    if is_admin:
        return {"allowed": True, "kind": "admin", "credits": 0, "subscription": None, "is_admin": True}
    if not profile:
        return {"allowed": False, "kind": "none", "credits": 0, "subscription": None, "is_admin": False}
    sub_status = (profile.get("sub_status") or "").lower()
    period_end = profile.get("sub_current_period_end")
    sub_active = False
    if sub_status == "active" and period_end:
        try:
            sub_active = datetime.fromisoformat(str(period_end).replace("Z", "+00:00")) > datetime.now(timezone.utc)
        except ValueError:
            sub_active = True
    elif sub_status == "active":
        sub_active = True
    credits = int(profile.get("download_credits") or 0)
    if profile.get("is_admin"):
        return {"allowed": True, "kind": "admin", "credits": credits, "subscription": None, "is_admin": True}
    if sub_active:
        return {
            "allowed": True,
            "kind": "subscription",
            "credits": credits,
            "subscription": {"status": sub_status, "period_end": period_end},
            "is_admin": False,
        }
    if credits > 0:
        return {
            "allowed": True,
            "kind": "credit",
            "credits": credits,
            "subscription": {"status": sub_status, "period_end": period_end} if sub_status else None,
            "is_admin": False,
        }
    return {
        "allowed": False,
        "kind": "none",
        "credits": credits,
        "subscription": {"status": sub_status, "period_end": period_end} if sub_status else None,
        "is_admin": False,
    }


def extract_link(resource: dict, rel: str) -> Optional[str]:
    for link in resource.get("links", []):
        if link.get("rel") == rel:
            return link.get("href")
    return None


def increment_credit(profile_id: str, order_id: Optional[str] = None, payer_id: Optional[str] = None):
    marker = f"paypal_order_{order_id}" if order_id else f"paypal_credit_{profile_id}_{int(time.time())}"
    if seen_event(marker, "paypal.order.credit"):
        return
    profile = profile_by_user_id(profile_id)
    if not profile:
        return
    db().table("profiles").update({
        "download_credits": int(profile.get("download_credits") or 0) + 1,
        "stripe_customer_id": payer_id or profile.get("stripe_customer_id"),
        "updated_at": now_iso(),
    }).eq("id", profile_id).execute()


def apply_paypal_subscription(profile_id: str, sub: dict):
    billing = sub.get("billing_info") or {}
    end = billing.get("next_billing_time")
    status = (sub.get("status") or "").lower()
    if status == "active" and not end:
        end = next_week_iso()
    db().table("profiles").update({
        "stripe_subscription_id": sub.get("id"),
        "stripe_customer_id": ((sub.get("subscriber") or {}).get("payer_id")),
        "sub_status": status,
        "sub_current_period_end": end,
        "updated_at": now_iso(),
    }).eq("id", profile_id).execute()


class CheckoutBody(BaseModel):
    plan: str


class AdminBody(BaseModel):
    password: str


@app.get("/api/config")
def api_config():
    return {
        "supabaseUrl": SUPABASE_URL,
        "supabaseAnonKey": SUPABASE_ANON_KEY,
        "prices": {"single": SINGLE_CENTS / 100, "weekly": WEEKLY_CENTS / 100},
        "provider": "paypal",
        "ready": bool(SUPABASE_URL and SUPABASE_ANON_KEY and paypal_ready()),
    }


@app.get("/api/me")
async def api_me(authorization: Optional[str] = Header(default=None), clipcut_admin: Optional[str] = Cookie(default=None)):
    user = await current_user(authorization)
    is_admin = admin_cookie_ok(clipcut_admin)
    profile = ensure_profile(user) if user else None
    if profile and profile.get("is_admin"):
        is_admin = True
    payload = entitlement_payload(profile, is_admin)
    payload["signed_in"] = bool(user)
    payload["email"] = (user.email if user else None) or (profile or {}).get("email")
    return payload


@app.post("/api/checkout")
async def api_checkout(body: CheckoutBody, request: Request, authorization: Optional[str] = Header(default=None)):
    user = require_user(await current_user(authorization))
    ensure_profile(user)
    origin = request.headers.get("origin") or APP_URL
    if body.plan == "single":
        order = await paypal_request("POST", "/v2/checkout/orders", {
            "intent": "CAPTURE",
            "purchase_units": [{
                "custom_id": user.id,
                "description": "ClipCut single download",
                "amount": {"currency_code": "USD", "value": "1.50"},
            }],
            "application_context": {
                "brand_name": "ClipCut",
                "landing_page": "LOGIN",
                "user_action": "PAY_NOW",
                "return_url": f"{origin}/?paid=single",
                "cancel_url": f"{origin}/?paid=cancel",
            },
        })
        return {"url": extract_link(order, "approve")}
    if body.plan == "weekly":
        plan_id = await paypal_weekly_plan()
        sub = await paypal_request("POST", "/v1/billing/subscriptions", {
            "plan_id": plan_id,
            "custom_id": user.id,
            "application_context": {
                "brand_name": "ClipCut",
                "shipping_preference": "NO_SHIPPING",
                "user_action": "SUBSCRIBE_NOW",
                "return_url": f"{origin}/?paid=weekly",
                "cancel_url": f"{origin}/?paid=cancel",
            },
        })
        return {"url": extract_link(sub, "approve")}
    raise HTTPException(400, "Choose single or weekly.")


@app.post("/api/paypal/capture")
async def api_paypal_capture(body: dict, authorization: Optional[str] = Header(default=None)):
    user = require_user(await current_user(authorization))
    order_id = (body or {}).get("order_id")
    if not order_id:
        raise HTTPException(400, "Missing PayPal order id.")
    order = await paypal_request("POST", f"/v2/checkout/orders/{order_id}/capture")
    units = order.get("purchase_units") or []
    custom_id = units[0].get("custom_id") if units else None
    if custom_id != user.id:
        raise HTTPException(403, "This order belongs to another account.")
    payer_id = ((order.get("payer") or {}).get("payer_id"))
    increment_credit(user.id, order_id=order_id, payer_id=payer_id)
    return {"ok": True}


@app.post("/api/paypal/complete-subscription")
async def api_paypal_subscription(body: dict, authorization: Optional[str] = Header(default=None)):
    user = require_user(await current_user(authorization))
    sub_id = (body or {}).get("subscription_id") or (body or {}).get("token")
    if not sub_id:
        raise HTTPException(400, "Missing PayPal subscription id.")
    sub = await paypal_request("GET", f"/v1/billing/subscriptions/{sub_id}")
    if sub.get("custom_id") != user.id:
        raise HTTPException(403, "This subscription belongs to another account.")
    apply_paypal_subscription(user.id, sub)
    return {"ok": True}


@app.post("/api/portal")
async def api_portal():
    return {"url": f"{PAYPAL_SITE}/myaccount/autopay/"}


@app.post("/api/download/authorize")
async def api_authorize(authorization: Optional[str] = Header(default=None), clipcut_admin: Optional[str] = Cookie(default=None)):
    user = await current_user(authorization)
    is_admin = admin_cookie_ok(clipcut_admin)
    profile = ensure_profile(user) if user else None
    if profile and profile.get("is_admin"):
        is_admin = True
    info = entitlement_payload(profile, is_admin)
    if not info["allowed"]:
        raise HTTPException(402, "Payment required.")
    kind = info["kind"]
    if kind == "credit":
        if not user:
            raise HTTPException(401, "Sign in first.")
        rpc = db().rpc("consume_download_credit", {"p_user": user.id}).execute()
        ok = rpc.data[0] if isinstance(rpc.data, list) and rpc.data else rpc.data
        if not ok:
            raise HTTPException(402, "No download credit left.")
        info["credits"] = max(0, int(info["credits"]) - 1)
        info["consumed"] = True
    else:
        info["consumed"] = False
    try:
        row = {"kind": kind}
        if user:
            row["user_id"] = user.id
        db().table("download_log").insert(row).execute()
    except Exception:
        pass
    return info


@app.post("/api/admin/unlock")
async def api_admin(body: AdminBody, response: Response, authorization: Optional[str] = Header(default=None)):
    if not ADMIN_PASSWORD or not hmac.compare_digest(body.password, ADMIN_PASSWORD):
        raise HTTPException(403, "Wrong admin password.")
    user = await current_user(authorization)
    if user:
        db().table("profiles").update({"is_admin": True, "updated_at": now_iso()}).eq("id", user.id).execute()
    exp = int(time.time()) + 60 * 60 * 24 * 30
    response.set_cookie("clipcut_admin", sign_admin(exp), httponly=True, samesite="lax", max_age=60 * 60 * 24 * 30, path="/")
    return {"ok": True, "kind": "admin"}


@app.post("/api/admin/lock")
async def api_admin_lock(response: Response):
    response.delete_cookie("clipcut_admin", path="/")
    return {"ok": True}


async def verify_paypal_webhook(request: Request, body: dict) -> bool:
    if not PAYPAL_WEBHOOK_ID:
        return False
    token = await paypal_token()
    headers = request.headers
    payload = {
        "auth_algo": headers.get("paypal-auth-algo"),
        "cert_url": headers.get("paypal-cert-url"),
        "transmission_id": headers.get("paypal-transmission-id"),
        "transmission_sig": headers.get("paypal-transmission-sig"),
        "transmission_time": headers.get("paypal-transmission-time"),
        "webhook_id": PAYPAL_WEBHOOK_ID,
        "webhook_event": body,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(
            f"{PAYPAL_BASE}/v1/notifications/verify-webhook-signature",
            json=payload,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
    return res.status_code < 400 and res.json().get("verification_status") == "SUCCESS"


@app.post("/api/paypal/webhook")
async def paypal_webhook(request: Request):
    body = await request.json()
    if not await verify_paypal_webhook(request, body):
        raise HTTPException(400, "PayPal webhook verification failed. Set PAYPAL_WEBHOOK_ID.")
    event_id = body.get("id")
    event_type = body.get("event_type") or "paypal.unknown"
    if seen_event(event_id, event_type):
        return {"ok": True, "duplicate": True}
    resource = body.get("resource") or {}
    if event_type == "CHECKOUT.ORDER.COMPLETED":
        order_id = resource.get("id")
        units = resource.get("purchase_units") or []
        user_id = units[0].get("custom_id") if units else None
        payer_id = ((resource.get("payer") or {}).get("payer_id"))
        if user_id:
            increment_credit(user_id, order_id=order_id, payer_id=payer_id)
    elif event_type.startswith("BILLING.SUBSCRIPTION"):
        sub_id = resource.get("id")
        user_id = resource.get("custom_id")
        profile = profile_by_user_id(user_id) if user_id else profile_by_subscription(sub_id)
        if profile:
            if event_type in ("BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.SUSPENDED", "BILLING.SUBSCRIPTION.EXPIRED"):
                resource["status"] = resource.get("status") or event_type.rsplit(".", 1)[-1]
            apply_paypal_subscription(profile["id"], resource)
    return {"ok": True}


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "supabase": bool(SUPABASE_URL and SERVICE_KEY),
        "paypal": paypal_ready(),
        "paypal_mode": PAYPAL_MODE,
        "weekly_plan": bool(PAYPAL_PLAN_WEEKLY),
    }


PUBLIC_FILES = {"index.html", "styles.css", "app.js", "billing.js", "i18n.js"}


def _public_path(name: str) -> Path:
    for base in (ROOT / "public", ROOT):
        path = base / name
        if path.is_file():
            return path
    raise HTTPException(404)


@app.get("/")
def index():
    return FileResponse(_public_path("index.html"))


@app.get("/{name}")
def public_file(name: str):
    if name not in PUBLIC_FILES:
        raise HTTPException(404)
    return FileResponse(_public_path(name))
