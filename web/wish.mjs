// Hold Space and speak. Let go and the words go out.
// Speech recognition only fills that text. Nothing here records audio
// or posts it to the game server.

export function installWish({ send }) {
  const saidEl = document.getElementById("said");
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let listening = false;
  let release = false;
  let draft = "";
  let interim = "";
  let rec = null;
  const hook = { started: 0, sent: 0 };
  window.__lumenWish = hook;

  function show(text) {
    const clean = String(text || "").trim();
    if (!saidEl) return;
    if (!clean) {
      saidEl.hidden = true;
      saidEl.textContent = "";
      document.documentElement.dataset.wish = "";
      return;
    }
    saidEl.hidden = false;
    saidEl.textContent = clean;
    document.documentElement.dataset.wish = clean;
  }

  function heard() {
    return (draft || interim || "").trim().slice(0, 80);
  }

  function submit() {
    if (!release) return;
    release = false;
    const clean = heard();
    draft = "";
    interim = "";
    if (!clean) {
      show("没听清，再按一次");
      return;
    }
    const ok = send({
      op: "wish",
      text: clean,
      lang: "zh-CN",
      source: "voice",
    });
    if (!ok) {
      show(clean);
      return;
    }
    hook.sent += 1;
    document.documentElement.dataset.wish = "sent";
    show(clean);
  }

  function ensureRec() {
    if (!Ctor || rec) return rec;
    rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "zh-CN";
    rec.onresult = (ev) => {
      let nextFinal = "";
      let nextInterim = "";
      const list = ev.results || [];
      for (let i = 0; i < list.length; i++) {
        const part = list[i];
        const bit = part && part[0] ? part[0].transcript : "";
        if (part && part.isFinal) nextFinal += bit;
        else nextInterim += bit;
      }
      if (nextFinal.trim()) draft = nextFinal.trim();
      interim = nextInterim.trim();
      const line = heard();
      if (line) show(line);
    };
    rec.onerror = () => {
      listening = false;
    };
    rec.onend = () => {
      listening = false;
      // The last words often arrive in the same turn as the end.
      setTimeout(submit, 80);
    };
    return rec;
  }

  function start() {
    if (!Ctor) {
      show("这个浏览器听不见");
      return;
    }
    if (listening) return;
    const engine = ensureRec();
    if (!engine) return;
    draft = "";
    interim = "";
    release = false;
    engine.lang = "zh-CN";
    try {
      engine.start();
      hook.started += 1;
      listening = true;
      document.documentElement.dataset.wish = "live";
      show("在听");
    } catch {
      listening = false;
      show("没听清，再按一次");
    }
  }

  function stop() {
    if (!Ctor || (!listening && !rec)) return;
    release = true;
    if (!rec || !listening) {
      submit();
      return;
    }
    try { rec.stop(); } catch {
      listening = false;
      submit();
    }
  }

  function typing() {
    const tag = document.activeElement && document.activeElement.tagName;
    return tag === "INPUT" || tag === "TEXTAREA";
  }

  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.key !== " ") return;
    if (typing()) return;
    e.preventDefault();
    if (e.repeat) return;
    start();
  });
  window.addEventListener("keyup", (e) => {
    if (e.code !== "Space" && e.key !== " ") return;
    if (typing()) return;
    e.preventDefault();
    stop();
  });
}
