// A wish is text. Speech recognition, when the browser has it, only fills
// that text. Nothing here records audio or posts it to the game server.
// Cloud recognition stays off until the child allows the one-line notice.

const COPY = {
  zh: {
    hold: "按住说",
    use: "就用这句",
    again: "再试一次",
    type: "改成打字",
    consent: "声音会交给浏览器的听写，不会存进本游戏",
    allow: "可以听",
    hear: "没听清，再按一次",
    mic: "麦克风先歇着，打字也行",
    talk: "读出来",
    presets: [
      "来一个金色的星星",
      "来一个要滑铲的花门",
      "把天空染成粉色",
      "来一只小兔子",
    ],
    lang: "zh-CN",
  },
  en: {
    hold: "Hold to talk",
    use: "Use this",
    again: "Try again",
    type: "Type instead",
    consent: "The browser's dictation hears this. The game does not keep the sound.",
    allow: "Allow",
    hear: "I didn't catch that. Press once more.",
    mic: "The microphone can rest. Typing works too.",
    talk: "Read it aloud",
    presets: [
      "A golden star on the path",
      "A flower gate to slide under",
      "Paint the sky pink",
      "A little bunny hops along",
    ],
    lang: "en-US",
  },
};

export function installWish({ send, muted }) {
  const openBtn = document.getElementById("wish-open");
  const panel = document.getElementById("wish");
  const live = document.getElementById("wish-live");
  const presets = document.getElementById("wish-presets");
  const field = document.getElementById("wish-text");
  const sendBtn = document.getElementById("wish-send");
  const micBtn = document.getElementById("wish-mic");
  const consent = document.getElementById("wish-consent");
  const allowBtn = document.getElementById("wish-allow");
  const confirm = document.getElementById("wish-confirm");
  const finalEl = document.getElementById("wish-final");
  const useBtn = document.getElementById("wish-use");
  const againBtn = document.getElementById("wish-again");
  const typeBtn = document.getElementById("wish-type");
  const talkBtn = document.getElementById("wish-talk");
  const zhBtn = document.getElementById("wish-zh");
  const enBtn = document.getElementById("wish-en");
  const saidEl = document.getElementById("said");
  const deck = document.getElementById("deck");
  const notes = document.getElementById("notes");
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;

  let lang = "zh";
  let cloudOk = false;
  let localOk = false;
  let usedVoice = false;
  let talk = false;
  let listening = false;
  let draft = "";
  let rec = null;

  const hook = { started: 0, sent: 0 };
  window.__lumenWish = hook;

  function copy() { return COPY[lang]; }

  function paint() {
    const c = copy();
    if (micBtn) micBtn.textContent = c.hold;
    if (sendBtn) sendBtn.textContent = c.use;
    if (useBtn) useBtn.textContent = c.use;
    if (againBtn) againBtn.textContent = c.again;
    if (typeBtn) typeBtn.textContent = c.type;
    if (consent) consent.textContent = c.consent;
    if (allowBtn) allowBtn.textContent = c.allow;
    if (talkBtn) talkBtn.textContent = c.talk;
    if (field) field.placeholder = c.use;
    if (zhBtn) zhBtn.setAttribute("aria-pressed", lang === "zh" ? "true" : "false");
    if (enBtn) enBtn.setAttribute("aria-pressed", lang === "en" ? "true" : "false");
    if (presets) {
      presets.replaceChildren();
      for (const phrase of c.presets) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wish-preset";
        btn.textContent = phrase;
        btn.addEventListener("click", () => submit(phrase, "preset"));
        presets.appendChild(btn);
      }
    }
    const root = document.documentElement;
    root.dataset.mic = !Ctor ? "off" : (localOk || cloudOk) ? "on" : "ask";
  }

  function showLive(text) {
    const clean = String(text || "").trim();
    if (live) live.textContent = clean;
    if (saidEl && clean) {
      saidEl.hidden = false;
      saidEl.textContent = clean;
    }
    document.documentElement.dataset.wish = clean ? "live" : "";
  }

  function reveal() {
    if (panel && panel.hidden) {
      panel.hidden = false;
      if (openBtn) openBtn.setAttribute("aria-expanded", "true");
      if (deck) deck.hidden = true;
      if (notes) notes.hidden = true;
    }
  }

  function showConsent() {
    reveal();
    if (consent) consent.hidden = false;
    if (allowBtn) allowBtn.hidden = false;
    document.documentElement.dataset.mic = "ask";
  }

  function childLine(text) {
    if (live) live.textContent = text;
    if (saidEl) {
      saidEl.hidden = false;
      saidEl.textContent = text;
    }
  }

  // On-device listening is only the default after the browser says that
  // engine is actually available. A processLocally field that still posts
  // audio off the device must not start on the first press.
  function probeLocal() {
    if (!Ctor || typeof Ctor.available !== "function") return;
    let pending;
    try {
      pending = Ctor.available({ langs: [copy().lang], processLocally: true });
    } catch {
      return;
    }
    const take = (status) => {
      if (status === "available" || status === true) {
        localOk = true;
        paint();
      }
    };
    if (pending && typeof pending.then === "function") pending.then(take).catch(() => {});
    else take(pending);
  }

  function ensureRec() {
    if (!Ctor || rec) return rec;
    rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    if ("processLocally" in rec) {
      try { rec.processLocally = !!(localOk && !cloudOk); } catch { /* cloud stays opt-in */ }
    }
    rec.onresult = (ev) => {
      let interim = "";
      let finalText = "";
      const list = ev.results || [];
      for (let i = 0; i < list.length; i++) {
        const part = list[i];
        const bit = part && part[0] ? part[0].transcript : "";
        if (part && part.isFinal) finalText += bit;
        else interim += bit;
      }
      if (finalText.trim()) draft = finalText.trim();
      showLive(interim || finalText || draft);
    };
    rec.onerror = (ev) => {
      listening = false;
      const code = ev && ev.error ? ev.error : "";
      if (localOk && (code === "language-not-supported" || code === "network")) {
        localOk = false;
        try { rec.processLocally = false; } catch { /* cloud stays opt-in */ }
        showConsent();
        return;
      }
      childLine(code === "not-allowed" || code === "service-not-allowed" ? copy().mic : copy().hear);
    };
    rec.onend = () => {
      listening = false;
      if (micBtn) micBtn.setAttribute("aria-pressed", "false");
      if (draft) showConfirm(draft);
      else if (document.documentElement.dataset.wish === "live") childLine(copy().hear);
    };
    return rec;
  }

  function showConfirm(text) {
    draft = text;
    if (finalEl) finalEl.textContent = text;
    if (confirm) confirm.hidden = false;
    document.documentElement.dataset.wish = "confirm";
  }

  function submit(text, source) {
    const clean = String(text || "").trim().slice(0, 80);
    if (!clean) {
      childLine(copy().hear);
      return;
    }
    const ok = send({
      op: "wish",
      text: clean,
      lang: copy().lang,
      source,
    });
    if (!ok) return;
    hook.sent += 1;
    document.documentElement.dataset.wish = "sent";
    if (confirm) confirm.hidden = true;
    if (source === "voice") {
      usedVoice = true;
      if (talkBtn) talkBtn.hidden = false;
    }
  }

  function startListen() {
    if (!Ctor) return;
    if (!localOk && !cloudOk) {
      showConsent();
      return;
    }
    const engine = ensureRec();
    if (!engine) return;
    if (listening) return;
    reveal();
    if ("processLocally" in engine) {
      try { engine.processLocally = !!(localOk && !cloudOk); } catch { /* keep the allowed engine */ }
    }
    draft = "";
    engine.lang = copy().lang;
    try {
      engine.start();
      hook.started += 1;
      listening = true;
      if (micBtn) micBtn.setAttribute("aria-pressed", "true");
      document.documentElement.dataset.wish = "live";
    } catch {
      listening = false;
      childLine(copy().hear);
    }
  }

  function stopListen() {
    if (!rec || !listening) return;
    try { rec.stop(); } catch { listening = false; }
  }

  function speak(text) {
    if (!talk || muted() || !window.speechSynthesis) return;
    const clean = String(text || "").trim();
    if (!clean) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = copy().lang;
    window.speechSynthesis.speak(utter);
  }

  window.__lumenOnDecision = (msg) => {
    if (!msg || msg.kind === "BUMP") return;
    if (talk) speak(msg.cue || "");
  };

  paint();
  probeLocal();
  if (Ctor && micBtn) micBtn.hidden = false;

  if (openBtn && panel) {
    openBtn.addEventListener("click", () => {
      const open = panel.hidden;
      panel.hidden = !open;
      openBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        if (deck) deck.hidden = true;
        if (notes) notes.hidden = true;
        paint();
      }
    });
  }
  if (zhBtn) zhBtn.addEventListener("click", () => { lang = "zh"; paint(); probeLocal(); });
  if (enBtn) enBtn.addEventListener("click", () => { lang = "en"; paint(); probeLocal(); });
  if (sendBtn && field) {
    sendBtn.addEventListener("click", () => submit(field.value, "type"));
  }
  if (field) {
    field.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        submit(field.value, "type");
      }
    });
  }
  if (micBtn) {
    micBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      startListen();
    });
    const end = (e) => {
      e.preventDefault();
      stopListen();
    };
    micBtn.addEventListener("pointerup", end);
    micBtn.addEventListener("pointerleave", stopListen);
    micBtn.addEventListener("pointercancel", stopListen);
  }
  if (allowBtn) {
    allowBtn.addEventListener("click", () => {
      cloudOk = true;
      if (consent) consent.hidden = true;
      allowBtn.hidden = true;
      document.documentElement.dataset.mic = "on";
    });
  }
  if (useBtn) useBtn.addEventListener("click", () => submit(draft, "voice"));
  if (againBtn) {
    againBtn.addEventListener("click", () => {
      draft = "";
      if (confirm) confirm.hidden = true;
      showLive("");
      document.documentElement.dataset.wish = "";
    });
  }
  if (typeBtn && field) {
    typeBtn.addEventListener("click", () => {
      if (confirm) confirm.hidden = true;
      field.value = draft;
      field.focus();
    });
  }
  if (talkBtn) {
    talkBtn.addEventListener("click", () => {
      talk = !talk;
      talkBtn.setAttribute("aria-pressed", talk ? "true" : "false");
      if (!talk && window.speechSynthesis) window.speechSynthesis.cancel();
    });
  }
  const muteBtn = document.getElementById("mute");
  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    });
  }
  window.addEventListener("keydown", (e) => {
    if (e.code !== "KeyV" || e.repeat) return;
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    e.preventDefault();
    startListen();
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "KeyV") stopListen();
  });
}
