(() => {
  const $ = (id) => document.getElementById(id);

  const billing = {
    ready: false,
    supabase: null,
    session: null,
    me: null,
    pending: null,
    prices: { single: 1.5, weekly: 3.5 },
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

  function headers() {
    const h = { "Content-Type": "application/json" };
    const token = billing.session && billing.session.access_token;
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  async function api(path, opts = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    let res;
    try {
      res = await fetch(path, {
        credentials: "same-origin",
        ...opts,
        signal: ctrl.signal,
        headers: { ...headers(), ...(opts.headers || {}) },
      });
    } catch (err) {
      clearTimeout(t);
      const e = new Error("Payment server is not responding.");
      e.status = 0;
      throw e;
    }
    clearTimeout(t);
    let data = {};
    try { data = await res.json(); } catch (_) {}
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
    if (!me) {
      el.textContent = `${money(billing.prices.single)} per download · ${money(billing.prices.weekly)} / 7 days unlimited`;
      return;
    }
    if (me.is_admin || me.kind === "admin") {
      el.textContent = "Admin — downloads unlocked";
      return;
    }
    if (me.kind === "subscription") {
      const until = me.subscription && me.subscription.period_end
        ? new Date(me.subscription.period_end).toLocaleDateString()
        : "this week";
      el.textContent = `Unlimited until ${until}`;
      return;
    }
    if (me.credits > 0) {
      el.textContent = `${me.credits} download${me.credits === 1 ? "" : "s"} remaining`;
      return;
    }
    el.textContent = `${money(billing.prices.single)} per download · ${money(billing.prices.weekly)} / 7 days unlimited`;
  }

  function accountLine() {
    const el = $("accountChip");
    if (!el) return;
    if (billing.session && billing.session.user) {
      el.textContent = billing.session.user.email || "Signed in";
    } else if (billing.me && billing.me.is_admin) {
      el.textContent = "Admin";
    } else {
      el.textContent = "Sign in";
    }
  }

  async function refreshMe() {
    try {
      billing.me = await api("/api/me");
    } catch (_) {
      billing.me = null;
    }
    accessLine();
    accountLine();
    const manage = $("payManageBtn");
    if (manage) {
      const sub = billing.me && billing.me.subscription && billing.me.kind === "subscription";
      manage.classList.toggle("hidden", !sub);
    }
    return billing.me;
  }

  function openPaywall(reason) {
    const modal = $("paywall");
    if (!modal) return;
    modal.classList.remove("hidden");
    const hint = $("payHint");
    if (hint) {
      hint.textContent = reason || "Pay to download the file you already edited in the browser.";
    }
    const signed = !!(billing.session && billing.session.user);
    if ($("payAuth")) $("payAuth").classList.toggle("hidden", signed);
    if ($("payPlans")) $("payPlans").classList.toggle("hidden", !signed);
    if ($("paySigned")) $("paySigned").classList.toggle("hidden", !signed);
    if (signed && $("paySignedEmail")) {
      $("paySignedEmail").textContent = billing.session.user.email || "";
    }
    if ($("paySingleLabel")) $("paySingleLabel").textContent = `${money(billing.prices.single)} · one download`;
    if ($("payWeeklyLabel")) $("payWeeklyLabel").textContent = `${money(billing.prices.weekly)} · 7 days unlimited, auto-renews`;
  }

  function closePaywall() {
    const modal = $("paywall");
    if (modal) modal.classList.add("hidden");
  }

  async function checkout(plan) {
    if (!(billing.session && billing.session.user)) {
      openPaywall("Sign in first, then pay.");
      return;
    }
    try {
      const data = await api("/api/checkout", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      if (data.url) window.location.href = data.url;
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
        ? "Pay $1.50 for this file, or $3.50 for 7 days of unlimited downloads."
        : "Pay $1.50 per file, or $3.50 for 7 days unlimited. Sign in to pay, or enter the admin password."
    );
    return false;
  }

  async function afterReturn() {
    const params = new URLSearchParams(window.location.search);
    const paid = params.get("paid");
    if (!paid) return;
    const token = params.get("token");
    const subscriptionId = params.get("subscription_id") || params.get("ba_token") || token;
    history.replaceState({}, "", window.location.pathname);
    if (paid === "cancel") {
      toast("Checkout canceled.");
      return;
    }
    toast("PayPal returned. Unlocking download…");
    try {
      if (paid === "single" && token) {
        await api("/api/paypal/capture", {
          method: "POST",
          body: JSON.stringify({ order_id: token }),
        });
      } else if (paid === "weekly" && subscriptionId) {
        await api("/api/paypal/complete-subscription", {
          method: "POST",
          body: JSON.stringify({ subscription_id: subscriptionId, token }),
        });
      }
    } catch (err) {
      toast(err.message || "Could not finish PayPal payment.");
    }
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 700));
      const me = await refreshMe();
      if (me && me.allowed) {
        closePaywall();
        toast(paid === "weekly" ? "Unlimited downloads are on for 7 days." : "Download unlocked.");
        if (billing.pending) {
          const fn = billing.pending;
          billing.pending = null;
          await fn();
        }
        return;
      }
    }
    toast("Payment is processing. Try Download again in a moment.");
  }

  async function init() {
    let cfg;
    try {
      cfg = await api("/api/config");
    } catch (_) {
      billing.ready = false;
      accessLine();
      return;
    }
    billing.prices = cfg.prices || billing.prices;
    billing.ready = true;
    if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
      billing.supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      const { data } = await billing.supabase.auth.getSession();
      billing.session = data.session;
      billing.supabase.auth.onAuthStateChange((_event, session) => {
        billing.session = session;
        refreshMe();
      });
    }
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
    $("paywall") && $("paywall").addEventListener("click", (e) => {
      if (e.target.id === "paywall") closePaywall();
    });
    $("paySignIn") && $("paySignIn").addEventListener("click", async () => {
      if (!billing.supabase) {
        toast("Supabase is not configured.");
        return;
      }
      const email = ($("payEmail").value || "").trim();
      const password = $("payPassword").value || "";
      if (!email || !password) {
        toast("Enter email and password.");
        return;
      }
      const { error } = await billing.supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast(error.message);
        return;
      }
      billing.session = (await billing.supabase.auth.getSession()).data.session;
      await refreshMe();
      openPaywall("Choose a download plan.");
    });
    $("paySignUp") && $("paySignUp").addEventListener("click", async () => {
      if (!billing.supabase) {
        toast("Supabase is not configured.");
        return;
      }
      const email = ($("payEmail").value || "").trim();
      const password = $("payPassword").value || "";
      if (!email || password.length < 6) {
        toast("Use an email and a password of at least 6 characters.");
        return;
      }
      const { data, error } = await billing.supabase.auth.signUp({ email, password });
      if (error) {
        toast(error.message);
        return;
      }
      if (data.session) {
        billing.session = data.session;
        await refreshMe();
        openPaywall("Account created. Choose a plan.");
      } else {
        toast("Check your email to confirm the account, then sign in.");
      }
    });
    $("paySignOut") && $("paySignOut").addEventListener("click", async () => {
      if (billing.supabase) await billing.supabase.auth.signOut();
      billing.session = null;
      await refreshMe();
      openPaywall();
    });
    $("paySingleBtn") && $("paySingleBtn").addEventListener("click", () => checkout("single"));
    $("payWeeklyBtn") && $("payWeeklyBtn").addEventListener("click", () => checkout("weekly"));
    $("payManageBtn") && $("payManageBtn").addEventListener("click", async () => {
      try {
        const data = await api("/api/portal", { method: "POST" });
        if (data.url) window.location.href = data.url;
      } catch (err) {
        toast(err.message || "Could not open billing portal.");
      }
    });
    $("payAdminBtn") && $("payAdminBtn").addEventListener("click", async () => {
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
