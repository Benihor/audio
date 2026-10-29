(() => {
  const KEY = "clipcutLang";
  const originals = new WeakMap();
  let lang = localStorage.getItem(KEY) || "en";
  let applying = false;

  const he = {
    "Sign in": "כניסה",
    "Sign out": "יציאה",
    "Create account": "יצירת חשבון",
    "Upload a recording": "העלה הקלטה",
    "Record instead": "הקלט במקום",
    "Random AI singing": "שירה אקראית AI",
    "Undo": "בטל",
    "New clip": "קליפ חדש",
    "Play preview": "השמע תצוגה",
    "Apply to selection": "החל על הבחירה",
    "Add echo": "הוסף הד",
    "Copy selection": "העתק בחירה",
    "Cut selection": "חתוך בחירה",
    "Paste on top": "הדבק מעל",
    "Paste on top fixed": "הדבק מעל מותאם",
    "Paste instead": "הדבק במקום",
    "Play from bar": "נגן מהסמן",
    "Stop": "עצור",
    "Play selection": "נגן בחירה",
    "Select all": "בחר הכל",
    "Play B": "נגן B",
    "Stop B": "עצור B",
    "Play B selection": "נגן בחירת B",
    "Load clip B": "טען קליפ B",
    "Keep this part": "שמור את החלק הזה",
    "Cut this part out": "חתוך את החלק הזה",
    "Keep the selected part": "שמור את החלק הנבחר",
    "On top": "מעל",
    "Instead": "במקום",
    "Record on top of selection": "הקלט מעל הבחירה",
    "Choose second file": "בחר קובץ שני",
    "Your clip": "הקליפ שלך",
    "Layer": "שכבה",
    "Main": "ראשי",
    "On top fixed": "מעל מותאם",
    "Add arrow": "הוסף חץ",
    "Play both": "נגן ביחד",
    "Merge into one": "מזג לקליפ אחד",
    "Remove layer": "הסר שכבה",
    "Strip voice (keep music)": "הסר קול (השאר מוזיקה)",
    "Find voice-like parts": "מצא חלקים דמויי קול",
    "Remove voice-like parts": "הסר חלקים דמויי קול",
    "Clean selection": "נקה בחירה",
    "Double": "דאבל",
    "High third": "שלישית גבוהה",
    "Fifth above": "חמישית מעל",
    "Octave below": "אוקטבה למטה",
    "Download": "הורדה",
    "Pay once for this file.": "תשלום חד פעמי לקובץ הזה.",
    "Auto-renews weekly until you cancel.": "מתחדש כל שבוע עד שתבטל.",
    "Manage subscription": "ניהול מנוי",
    "Unlock as admin": "פתח כמנהל",
    "Volume": "ווליום",
    "Pitch": "גובה צליל",
    "Speed": "מהירות",
    "Amount": "כמות",
    "Strip": "הסרה",
    "sec": "שנ׳",
  };

  function translateTextNode(node) {
    const raw = node.nodeValue;
    const trimmed = raw.trim();
    if (!trimmed) return;

    if (!originals.has(node)) originals.set(node, trimmed);
    const original = originals.get(node);

    if (lang === "en") {
      if (trimmed !== original) node.nodeValue = raw.replace(trimmed, original);
      return;
    }

    const translated = he[original] || he[trimmed];
    if (translated && trimmed !== translated) {
      node.nodeValue = raw.replace(trimmed, translated);
    }
  }

  function walk(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.id === "langToggle" || ["SCRIPT", "STYLE", "INPUT", "TEXTAREA"].includes(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let node;
    while ((node = walker.nextNode())) translateTextNode(node);
  }

  function applyLang() {
    applying = true;
    document.documentElement.lang = lang === "he" ? "he" : "en";
    document.body.classList.toggle("lang-he", lang === "he");
    const btn = document.getElementById("langToggle");
    if (btn) btn.textContent = lang === "he" ? "English" : "עברית";
    walk();
    applying = false;
  }

  function setLang(next) {
    lang = next;
    localStorage.setItem(KEY, lang);
    applyLang();
  }

  window.ClipCutLang = {
    get: () => lang,
    set: setLang,
    apply: applyLang,
  };

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("langToggle");
    if (btn) {
      btn.addEventListener("click", () => setLang(lang === "he" ? "en" : "he"));
    }
    applyLang();

    const observer = new MutationObserver(() => {
      if (applying || lang !== "he") return;
      requestAnimationFrame(applyLang);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
})();
