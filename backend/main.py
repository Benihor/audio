import hmac
import hashlib
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import stripe
from dotenv import load_dotenv
from fastapi import Cookie, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel
from supabase import Client, create_client

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

APP_URL = os.getenv("APP_URL", "http://127.0.0.1:8765").rstrip("/")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
STRIPE_SECRET = os.getenv("STRIPE_SECRET_KEY", "").strip()
WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()
ADMIN_COOKIE_SECRET = os.getenv("ADMIN_COOKIE_SECRET", "clipcut-admin-secret").strip()
SINGLE_CENTS = 150
WEEKLY_CENTS = 350

stripe.api_key = STRIPE_SECRET
PRICE_SINGLE = os.getenv("STRIPE_PRICE_SINGLE", "").strip()
PRICE_WEEKLY = os.getenv("STRIPE_PRICE_WEEKLY", "").strip()

app = FastAPI(title="ClipCut")


def db() -> Client:
    if not SUPABASE_URL or not SERVICE_KEY:
        raise HTTPException(503, "Supabase is not configured.")
    return create_client(SUPABASE_URL, SERVICE_KEY)


def utc_from_ts(ts):
    if not ts:
        return None
    return datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()


def sub_period_end(sub):
    ts = getattr(sub, "current_period_end", None)
    if ts:
        return utc_from_ts(ts)
    if isinstance(sub, dict):
        ts = sub.get("current_period_end")
        if ts:
            return utc_from_ts(ts)
        items = (sub.get("items") or {}).get("data") or []
        if items:
            return utc_from_ts(items[0].get("current_period_end"))
    items = getattr(getattr(sub, "items", None), "data", None)
    if items:
        return utc_from_ts(getattr(items[0], "current_period_end", None))
    return None


def ensure_prices():
    global PRICE_SINGLE, PRICE_WEEKLY
    if not STRIPE_SECRET:
        return
    if not PRICE_SINGLE:
        product = stripe.Product.create(name="ClipCut single download")
        price = stripe.Price.create(
            product=product.id,
            unit_amount=SINGLE_CENTS,
            currency="usd",
        )
        PRICE_SINGLE = price.id
        print(f"Created STRIPE_PRICE_SINGLE={PRICE_SINGLE}")
    if not PRICE_WEEKLY:
        product = stripe.Product.create(name="ClipCut unlimited downloads (7 days)")
        price = stripe.Price.create(
            product=product.id,
            unit_amount=WEEKLY_CENTS,
            currency="usd",
            recurring={"interval": "week"},
        )
        PRICE_WEEKLY = price.id
        print(f"Created STRIPE_PRICE_WEEKLY={PRICE_WEEKLY}")


@app.on_event("startup")
def on_startup():
    if STRIPE_SECRET:
        try:
            ensure_prices()
        except Exception as err:
            print("Stripe price setup skipped:", err)


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
    expect = hmac.new(
        ADMIN_COOKIE_SECRET.encode(), f"{flag}.{exp}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expect, sig)


async def current_user(authorization: Optional[str]):
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        res = db().auth.get_user(token)
        return res.user
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
            client.table("profiles").update({"email": user.email, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", user.id).execute()
            row["email"] = user.email
        return row
    client.table("profiles").insert({"id": user.id, "email": user.email}).execute()
    again = client.table("profiles").select("*").eq("id", user.id).execute()
    return again.data[0]


def entitlement_payload(profile: dict | None, is_admin: bool):
    if is_admin:
        return {
            "allowed": True,
            "kind": "admin",
            "credits": 0,
            "subscription": None,
            "is_admin": True,
        }
    if not profile:
        return {
            "allowed": False,
            "kind": "none",
            "credits": 0,
            "subscription": None,
            "is_admin": False,
        }
    sub_status = (profile.get("sub_status") or "").lower()
    period_end = profile.get("sub_current_period_end")
    sub_active = False
    if sub_status in ("active", "trialing") and period_end:
        try:
            end = datetime.fromisoformat(str(period_end).replace("Z", "+00:00"))
            sub_active = end > datetime.now(timezone.utc)
        except ValueError:
            sub_active = sub_status in ("active", "trialing")
    elif sub_status in ("active", "trialing"):
        sub_active = True
    credits = int(profile.get("download_credits") or 0)
    if profile.get("is_admin"):
        return {
            "allowed": True,
            "kind": "admin",
            "credits": credits,
            "subscription": {"status": sub_status, "period_end": period_end} if sub_status else None,
            "is_admin": True,
        }
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


def seen_event(event_id: str, event_type: str) -> bool:
    client = db()
    existing = client.table("stripe_events").select("id").eq("id", event_id).execute()
    if existing.data:
        return True
    client.table("stripe_events").insert({"id": event_id, "type": event_type}).execute()
    return False


def profile_by_customer(customer_id: str):
    if not customer_id:
        return None
    found = db().table("profiles").select("*").eq("stripe_customer_id", customer_id).limit(1).execute()
    return found.data[0] if found.data else None


def profile_by_user_id(user_id: str):
    if not user_id:
        return None
    found = db().table("profiles").select("*").eq("id", user_id).limit(1).execute()
    return found.data[0] if found.data else None


def apply_subscription(profile_id: str, sub):
    db().table("profiles").update(
        {
            "stripe_subscription_id": sub.id,
            "stripe_customer_id": sub.customer if isinstance(sub.customer, str) else getattr(sub.customer, "id", None),
            "sub_status": sub.status,
            "sub_current_period_end": sub_period_end(sub),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", profile_id).execute()


async def get_or_create_customer(profile: dict, email: str | None):
    if profile.get("stripe_customer_id"):
        return profile["stripe_customer_id"]
    customer = stripe.Customer.create(
        email=email or profile.get("email"),
        metadata={"supabase_user_id": profile["id"]},
    )
    db().table("profiles").update(
        {
            "stripe_customer_id": customer.id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", profile["id"]).execute()
    return customer.id


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
        "ready": bool(SUPABASE_URL and SUPABASE_ANON_KEY and STRIPE_SECRET),
    }


@app.get("/api/me")
async def api_me(
    authorization: str | None = Header(default=None),
    clipcut_admin: str | None = Cookie(default=None),
):
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
async def api_checkout(
    body: CheckoutBody,
    request: Request,
    authorization: str | None = Header(default=None),
):
    if not STRIPE_SECRET:
        raise HTTPException(503, "Stripe is not configured.")
    ensure_prices()
    user = require_user(await current_user(authorization))
    profile = ensure_profile(user)
    if body.plan not in ("single", "weekly"):
        raise HTTPException(400, "Choose single or weekly.")
    customer_id = await get_or_create_customer(profile, user.email)
    origin = request.headers.get("origin") or APP_URL
    if body.plan == "single":
        session = stripe.checkout.Session.create(
            mode="payment",
            customer=customer_id,
            line_items=[{"price": PRICE_SINGLE, "quantity": 1}],
            success_url=f"{origin}/?paid=single",
            cancel_url=f"{origin}/?paid=cancel",
            client_reference_id=user.id,
            metadata={"supabase_user_id": user.id, "plan": "single"},
            allow_promotion_codes=True,
        )
    else:
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": PRICE_WEEKLY, "quantity": 1}],
            success_url=f"{origin}/?paid=weekly",
            cancel_url=f"{origin}/?paid=cancel",
            client_reference_id=user.id,
            metadata={"supabase_user_id": user.id, "plan": "weekly"},
            subscription_data={"metadata": {"supabase_user_id": user.id}},
            allow_promotion_codes=True,
        )
    return {"url": session.url}


@app.post("/api/portal")
async def api_portal(
    request: Request,
    authorization: str | None = Header(default=None),
):
    user = require_user(await current_user(authorization))
    profile = ensure_profile(user)
    if not profile.get("stripe_customer_id"):
        raise HTTPException(400, "No Stripe customer yet.")
    origin = request.headers.get("origin") or APP_URL
    portal = stripe.billing_portal.Session.create(
        customer=profile["stripe_customer_id"],
        return_url=origin,
    )
    return {"url": portal.url}


@app.post("/api/download/authorize")
async def api_authorize(
    authorization: str | None = Header(default=None),
    clipcut_admin: str | None = Cookie(default=None),
):
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
        ok = rpc.data
        if isinstance(ok, list):
            ok = ok[0] if ok else False
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
async def api_admin(body: AdminBody, response: Response, authorization: str | None = Header(default=None)):
    if not ADMIN_PASSWORD or not hmac.compare_digest(body.password, ADMIN_PASSWORD):
        raise HTTPException(403, "Wrong admin password.")
    user = await current_user(authorization)
    if user:
        db().table("profiles").update(
            {"is_admin": True, "updated_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", user.id).execute()
    exp = int(time.time()) + 60 * 60 * 24 * 30
    response.set_cookie(
        key="clipcut_admin",
        value=sign_admin(exp),
        httponly=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
        path="/",
    )
    return {"ok": True, "kind": "admin"}


@app.post("/api/admin/lock")
async def api_admin_lock(response: Response):
    response.delete_cookie("clipcut_admin", path="/")
    return {"ok": True}


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request, stripe_signature: str | None = Header(default=None)):
    payload = await request.body()
    if not WEBHOOK_SECRET:
        raise HTTPException(503, "STRIPE_WEBHOOK_SECRET is missing.")
    try:
        event = stripe.Webhook.construct_event(payload, stripe_signature, WEBHOOK_SECRET)
    except Exception as err:
        raise HTTPException(400, f"Webhook error: {err}") from err
    if seen_event(event["id"], event["type"]):
        return {"ok": True, "duplicate": True}

    etype = event["type"]
    obj = event["data"]["object"]

    if etype == "checkout.session.completed":
        user_id = (obj.get("metadata") or {}).get("supabase_user_id") or obj.get("client_reference_id")
        profile = profile_by_user_id(user_id) or profile_by_customer(obj.get("customer"))
        if not profile:
            return {"ok": True, "skipped": "no profile"}
        customer_id = obj.get("customer")
        updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if customer_id:
            updates["stripe_customer_id"] = customer_id
        if obj.get("mode") == "payment":
            updates["download_credits"] = int(profile.get("download_credits") or 0) + 1
            db().table("profiles").update(updates).eq("id", profile["id"]).execute()
        elif obj.get("mode") == "subscription" and obj.get("subscription"):
            sub = stripe.Subscription.retrieve(obj["subscription"])
            apply_subscription(profile["id"], sub)

    elif etype in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
        sub = stripe.Subscription.retrieve(obj["id"])
        profile = profile_by_customer(sub.customer if isinstance(sub.customer, str) else getattr(sub.customer, "id", None))
        user_id = (getattr(sub, "metadata", None) or {}).get("supabase_user_id") if not isinstance(sub, dict) else (sub.get("metadata") or {}).get("supabase_user_id")
        if not profile and user_id:
            profile = profile_by_user_id(user_id)
        if profile:
            apply_subscription(profile["id"], sub)

    elif etype == "invoice.paid":
        sub_id = obj.get("subscription")
        if sub_id:
            sub = stripe.Subscription.retrieve(sub_id)
            profile = profile_by_customer(obj.get("customer"))
            if profile:
                apply_subscription(profile["id"], sub)

    return {"ok": True}


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "supabase": bool(SUPABASE_URL and SERVICE_KEY),
        "stripe": bool(STRIPE_SECRET),
        "prices": {"single": PRICE_SINGLE or None, "weekly": PRICE_WEEKLY or None},
    }


PUBLIC_FILES = {
    "index.html",
    "styles.css",
    "app.js",
    "billing.js",
}


@app.get("/")
def index():
    return FileResponse(ROOT / "index.html")


@app.get("/{name}")
def public_file(name: str):
    if name not in PUBLIC_FILES:
        raise HTTPException(404)
    path = ROOT / name
    if not path.is_file():
        raise HTTPException(404)
    return FileResponse(path)


try:
    from .paypal_main import app as app
except ImportError:
    from paypal_main import app as app
