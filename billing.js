(() => {
  const $ = (id) => document.getElementById(id);

  const billing = {
    ready: false,
    me: null,
    pending: null,
    prices: { single: 2.5 },
  };

  function toast(msg) {
    if (window.clipcutToast) window.clipcutToast(msg);
    else {
      const el = $("toast");
      if (!el) return;
      el.textContent = msg;
      el.classList.add("show");
      clearTimeout(toast._t);
      toast._t = setTimeout(() => el.classList.remove("show"), 2400);
    }
  }

  async function api(path, opts = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    let res;
    try {
      res = await fetch(path, {
        credentials: "same-origin",
        ...opts,
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          ...(opts.headers || {}),
        },
      });
    } catch (_) {
      clearTimeout(t);
      const e = new Error("Payment server is not responding.");
      e.status = 0;
      throw e;
    }
    clearTimeout(t);
    let data = {};
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok) {
      const msg = data.detail || data.message || res.statusText;
      const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function money(n) {
    return `$${Number(n).toFixed(2)}`;
  }

  function accessLine() {
    const el = $("downloadAccess");
    if (!el) return;
    const me = billing.me;
    if (me && (me.is_admin || me.kind === "admin")) {
      el.textContent = "Admin — downloads unlocked";
      return;
    }
    if (me && me.credits > 0) {
      el.textContent = `${me.credits} download${me.credits === 1 ? "" : "s"} ready`;
      return;
    }
    el.textContent = `${money(billing.prices.single)} per download · PayPal`;
  }

  function accountLine() {
    const el = $("accountChip");
    if (!el) return;
    if (billing.me && billing.me.is_admin) el.textContent = "Admin";
    else if (billing.me && billing.me.credits > 0) el.textContent = "Download ready";
    else el.textContent = `Pay ${money(billing.prices.single)}`;
  }

  async function refreshMe() {
    try {
      billing.me = await api("/api/me");
    } catch (_) {
      billing.me = null;
    }
    accessLine();
    accountLine();
    return billing.me;
  }

  function openPaywall(reason) {
    const modal = $("paywall");
    if (!modal) return;
    modal.classList.remove("hidden");
    const hint = $("payHint");
    if (hint) {
      hint.textContent =
        reason ||
        `Pay ${money(billing.prices.single)} once with PayPal to download this file. No account needed.`;
    }
    if ($("paySingleLabel")) {
      $("paySingleLabel").textContent = `${money(billing.prices.single)} · one download`;
    }
  }

  function closePaywall() {
    const modal = $("paywall");
    if (modal) modal.classList.add("hidden");
  }

  async function checkout() {
    try {
      const data = await api("/api/checkout", { method: "POST", body: "{}" });
      if (data.url) window.location.href = data.url;
      else toast("PayPal did not return a checkout link.");
    } catch (err) {
      toast(err.message || "Could not start checkout.");
    }
  }

  async function authorizeDownload() {
    try {
      if (billing.ready) {
        await refreshMe();
        if (billing.me && billing.me.allowed) {
          await api("/api/download/authorize", { method: "POST" });
          await refreshMe();
          return true;
        }
      }
    } catch (err) {
      if (err.status !== 401 && err.status !== 402) {
        toast(err.message || "Could not check payment status.");
      }
    }
    openPaywall(
      billing.ready
        ? `Pay ${money(billing.prices.single)} with PayPal to unlock this download.`
        : "Payments are not configured yet. Set live PayPal keys on the server."
    );
    return false;
  }

  async function afterReturn() {
    const params = new URLSearchParams(window.location.search);
    const paid = params.get("paid");
    if (!paid) return;
    const token = params.get("token");
    history.replaceState({}, "", window.location.pathname);
    if (paid === "cancel") {
      toast("Checkout canceled.");
      return;
    }
    if (paid !== "single" || !token) {
      toast("Missing PayPal order. Try paying again.");
      return;
    }
    toast("PayPal returned. Unlocking download…");
    try {
      await api("/api/paypal/capture", {
        method: "POST",
        body: JSON.stringify({ order_id: token }),
      });
    } catch (err) {
      toast(err.message || "Could not finish PayPal payment.");
      return;
    }
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const me = await refreshMe();
      if (me && me.allowed) {
        closePaywall();
        toast("Download unlocked. Click Download again.");
        if (billing.pending) {
          const fn = billing.pending;
          billing.pending = null;
          await fn();
        }
        return;
      }
    }
    toast("Payment received. Click Download again.");
  }

  async function init() {
    try {
      const cfg = await api("/api/config");
      billing.prices = cfg.prices || billing.prices;
      billing.ready = !!cfg.ready;
    } catch (_) {
      billing.ready = false;
    }
    accessLine();
    await refreshMe();
    await afterReturn();
  }

  window.ClipCutBilling = {
    authorizeDownload,
    queueDownload(fn) {
      billing.pending = fn;
    },
    refresh: refreshMe,
    open: openPaywall,
    close: closePaywall,
  };

  document.addEventListener("DOMContentLoaded", () => {
    $("accountChip") && $("accountChip").addEventListener("click", () => openPaywall());
    $("payClose") && $("payClose").addEventListener("click", closePaywall);
    $("paywall") &&
      $("paywall").addEventListener("click", (e) => {
        if (e.target.id === "paywall") closePaywall();
      });
    $("paySingleBtn") && $("paySingleBtn").addEventListener("click", () => checkout());
    $("payAdminBtn") &&
      $("payAdminBtn").addEventListener("click", async () => {
        const password = $("payAdminPassword").value || "";
        if (!password) {
          toast("Enter the admin password.");
          return;
        }
        try {
          await api("/api/admin/unlock", {
            method: "POST",
            body: JSON.stringify({ password }),
          });
          $("payAdminPassword").value = "";
          await refreshMe();
          closePaywall();
          toast("Admin unlock on. Downloads have no charge.");
          if (billing.pending) {
            const fn = billing.pending;
            billing.pending = null;
            await fn();
          }
        } catch (err) {
          toast(err.message || "Wrong admin password.");
        }
      });
    init();
  });
})();
