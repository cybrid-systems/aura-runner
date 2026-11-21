// Hold Space and speak. Let go and the words go out.
// Speech recognition only fills that text. Nothing here records audio
// or posts it to the game server.

// Names the recognizer confuses with ordinary words (背景, 程度, 伤害).
// A hit among the alternatives wins over the top guess.
export const CITY_PHRASES = [
  "北京", "北平", "京城", "上海", "魔都", "申城", "杭州", "西湖", "杭城",
  "成都", "蓉城", "西安", "长安", "重庆", "香港", "香江", "纽约",
  "旧金山", "三藩市", "洛杉矶", "洛城", "巴黎", "花都", "伦敦", "罗马",
  "威尼斯", "东京", "東京", "江户",
  "下一个城市", "下个城市", "换个城市", "换一座城市", "另一座城市", "别的城市", "其他城市",
  "中国城市", "美国城市", "欧洲城市", "环球旅行",
  "beijing", "shanghai", "hangzhou", "chengdu", "xian", "chongqing", "hong kong",
  "new york", "san francisco", "los angeles", "paris", "london", "venice", "tokyo",
];

export function mentionsCity(line) {
  const text = String(line || "");
  const low = text.toLowerCase();
  return CITY_PHRASES.some((phrase) => {
    if (/[\u4e00-\u9fff]/.test(phrase)) return text.includes(phrase);
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z])${escaped}(?:[^a-z]|$)`).test(low);
  });
}

export function preferHeard(alternatives) {
  const list = [];
  for (const raw of alternatives || []) {
    const line = String(raw || "").trim();
    if (line) list.push(line);
  }
  if (!list.length) return "";
  for (const line of list) {
    if (mentionsCity(line)) return line;
  }
  return list[0];
}

function altsOf(part) {
  const out = [];
  const n = part && typeof part.length === "number" ? part.length : 0;
  for (let j = 0; j < n; j++) {
    const bit = part[j] && part[j].transcript;
    if (bit && String(bit).trim()) out.push(String(bit));
  }
  return out;
}

function biasCities(engine) {
  const Phrase = typeof window !== "undefined" && window.SpeechRecognitionPhrase;
  if (!Phrase || !engine) return;
  try {
    const phrases = CITY_PHRASES.map((phrase) => new Phrase(phrase, 5));
    if (engine.phrases && typeof engine.phrases.push === "function") {
      for (const phrase of phrases) engine.phrases.push(phrase);
    } else {
      engine.phrases = phrases;
    }
  } catch {
    // Cloud recognition still runs when biasing is missing.
  }
}

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
  }

  function ensureRec() {
    if (!Ctor || rec) return rec;
    rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "zh-CN";
    rec.maxAlternatives = 5;
    biasCities(rec);
    rec.onresult = (ev) => {
      let nextFinal = "";
      let nextInterim = "";
      const list = ev.results || [];
      for (let i = 0; i < list.length; i++) {
        const part = list[i];
        const bit = preferHeard(altsOf(part));
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
