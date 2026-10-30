"""ClipCut API: PayPal $2.50 one-time download unlock (no login / no database)."""
import hmac
import hashlib
import os
import time
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import Cookie, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel

HERE = Path(__file__).resolve().parent
if (HERE / "public").is_dir() or (HERE / "index.html").is_file():
    ROOT = HERE
elif (HERE.parent / "public").is_dir() or (HERE.parent / "index.html").is_file():
    ROOT = HERE.parent
else:
    ROOT = HERE.parent

load_dotenv(ROOT / ".env")
load_dotenv(HERE / ".env")

APP_URL = os.getenv("APP_URL", "http://127.0.0.1:8765").rstrip("/")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()
ADMIN_COOKIE_SECRET = os.getenv("ADMIN_COOKIE_SECRET", "clipcut-admin-secret").strip()
PAYPAL_MODE = os.getenv("PAYPAL_MODE", "sandbox").strip().lower()
PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID", "").strip()
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET", "").strip()

DOWNLOAD_CENTS = 250
DOWNLOAD_USD = f"{DOWNLOAD_CENTS / 100:.2f}"
CREDIT_COOKIE = "clipcut_credit"
CREDIT_TTL_SEC = 60 * 60 * 24  # 24h to use the paid download
PAYPAL_BASE = "https://api-m.paypal.com" if PAYPAL_MODE == "live" else "https://api-m.sandbox.paypal.com"

app = FastAPI(title="ClipCut")


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
            },
        )
    if res.status_code >= 400:
        raise HTTPException(502, f"PayPal error: {res.text[:220]}")
    return res.json() if res.content else {}


def extract_link(payload: dict, rel: str) -> str:
    for link in payload.get("links") or []:
        if link.get("rel") == rel and link.get("href"):
            return link["href"]
    raise HTTPException(502, f"PayPal did not return a {rel} link.")


def sign_parts(*parts: str) -> str:
    msg = ".".join(parts)
    sig = hmac.new(ADMIN_COOKIE_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}.{sig}"


def verify_parts(value: Optional[str], expected_len: int) -> Optional[list[str]]:
    if not value or not ADMIN_COOKIE_SECRET:
        return None
    parts = value.split(".")
    if len(parts) != expected_len + 1:
        return None
    *body, sig = parts
    expect = hmac.new(
        ADMIN_COOKIE_SECRET.encode(), ".".join(body).encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expect, sig):
        return None
    return body


def admin_cookie_ok(value: Optional[str]) -> bool:
    body = verify_parts(value, 2)
    if not body:
        return False
    flag, exp = body
    if flag != "1":
        return False
    try:
        return int(exp) >= int(time.time())
    except ValueError:
        return False


def credit_from_cookie(value: Optional[str]) -> int:
    body = verify_parts(value, 2)
    if not body:
        return 0
    credits_s, exp_s = body
    try:
        if int(exp_s) < int(time.time()):
            return 0
        return max(0, int(credits_s))
    except ValueError:
        return 0


def set_credit_cookie(response: Response, credits: int) -> None:
    if credits <= 0:
        response.delete_cookie(CREDIT_COOKIE, path="/")
        return
    exp = int(time.time()) + CREDIT_TTL_SEC
    response.set_cookie(
        key=CREDIT_COOKIE,
        value=sign_parts(str(credits), str(exp)),
        httponly=True,
        samesite="lax",
        secure=APP_URL.startswith("https://"),
        max_age=CREDIT_TTL_SEC,
        path="/",
    )


def entitlement(is_admin: bool, credits: int) -> dict:
    if is_admin:
        return {"allowed": True, "kind": "admin", "credits": credits, "is_admin": True}
    if credits > 0:
        return {"allowed": True, "kind": "credit", "credits": credits, "is_admin": False}
    return {"allowed": False, "kind": "none", "credits": 0, "is_admin": False}


class AdminBody(BaseModel):
    password: str


@app.get("/api/config")
def api_config():
    return {
        "prices": {"single": DOWNLOAD_CENTS / 100},
        "provider": "paypal",
        "paypalMode": PAYPAL_MODE,
        "ready": paypal_ready(),
        "authRequired": False,
    }


@app.get("/api/me")
async def api_me(
    clipcut_admin: Optional[str] = Cookie(default=None),
    clipcut_credit: Optional[str] = Cookie(default=None),
):
    is_admin = admin_cookie_ok(clipcut_admin)
    credits = credit_from_cookie(clipcut_credit)
    payload = entitlement(is_admin, credits)
    payload["signed_in"] = False
    return payload


@app.post("/api/checkout")
async def api_checkout(request: Request):
    if not paypal_ready():
        raise HTTPException(503, "PayPal is not configured.")
    origin = (request.headers.get("origin") or APP_URL).rstrip("/")
    order = await paypal_request(
        "POST",
        "/v2/checkout/orders",
        {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "description": "ClipCut download",
                    "amount": {"currency_code": "USD", "value": DOWNLOAD_USD},
                }
            ],
            "application_context": {
                "brand_name": "ClipCut",
                "landing_page": "LOGIN",
                "user_action": "PAY_NOW",
                "return_url": f"{origin}/?paid=single",
                "cancel_url": f"{origin}/?paid=cancel",
            },
        },
    )
    return {"url": extract_link(order, "approve")}


@app.post("/api/paypal/capture")
async def api_paypal_capture(body: dict, response: Response):
    order_id = (body or {}).get("order_id")
    if not order_id:
        raise HTTPException(400, "Missing PayPal order id.")
    order = await paypal_request("POST", f"/v2/checkout/orders/{order_id}/capture")
    status = (order.get("status") or "").upper()
    if status not in ("COMPLETED", "APPROVED"):
        # capture response for completed orders is usually COMPLETED
        capture_ok = False
        for unit in order.get("purchase_units") or []:
            for cap in ((unit.get("payments") or {}).get("captures") or []):
                if (cap.get("status") or "").upper() == "COMPLETED":
                    capture_ok = True
                    break
        if not capture_ok and status != "COMPLETED":
            raise HTTPException(402, f"Payment not completed ({status or 'unknown'}).")
    set_credit_cookie(response, 1)
    return {"ok": True, "credits": 1}


@app.post("/api/download/authorize")
async def api_authorize(
    response: Response,
    clipcut_admin: Optional[str] = Cookie(default=None),
    clipcut_credit: Optional[str] = Cookie(default=None),
):
    is_admin = admin_cookie_ok(clipcut_admin)
    credits = credit_from_cookie(clipcut_credit)
    info = entitlement(is_admin, credits)
    if not info["allowed"]:
        raise HTTPException(402, "Payment required.")
    if info["kind"] == "credit":
        set_credit_cookie(response, credits - 1)
        info["credits"] = credits - 1
        info["consumed"] = True
    else:
        info["consumed"] = False
    return info


@app.post("/api/admin/unlock")
async def api_admin(body: AdminBody, response: Response):
    if not ADMIN_PASSWORD or not hmac.compare_digest(body.password, ADMIN_PASSWORD):
        raise HTTPException(403, "Wrong admin password.")
    exp = int(time.time()) + 60 * 60 * 24 * 30
    response.set_cookie(
        key="clipcut_admin",
        value=sign_parts("1", str(exp)),
        httponly=True,
        samesite="lax",
        secure=APP_URL.startswith("https://"),
        max_age=60 * 60 * 24 * 30,
        path="/",
    )
    return {"ok": True, "kind": "admin"}


@app.post("/api/admin/lock")
async def api_admin_lock(response: Response):
    response.delete_cookie("clipcut_admin", path="/")
    return {"ok": True}


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "paypal": paypal_ready(),
        "paypal_mode": PAYPAL_MODE,
        "price": DOWNLOAD_CENTS / 100,
        "auth": False,
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
