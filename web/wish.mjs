// Hold Space and speak. Let go and the words go out.
// Speech recognition only fills that text. Nothing here records audio
// or posts it to the game server.

// Names the recognizer confuses with ordinary words (背景, 程度, 伤害).
// A named place in any alternative wins over a song mishear. A generic
// "下一个城市" stays in confidence order with "下一首", so both commands work.
export const NAMED_CITY_PHRASES = [
  "北京", "北平", "京城", "上海", "魔都", "申城", "杭州", "西湖", "杭城",
  "成都", "蓉城", "西安", "长安", "重庆", "香港", "香江", "纽约",
  "旧金山", "三藩市", "洛杉矶", "洛城", "巴黎", "花都", "伦敦", "罗马",
  "威尼斯", "东京", "東京", "江户",
  "beijing", "shanghai", "hangzhou", "chengdu", "xian", "chongqing", "hong kong",
  "new york", "san francisco", "los angeles", "paris", "london", "venice", "tokyo",
];

export const TOUR_PHRASES = [
  "下一个城市", "下个城市", "下一座城市", "换个城市", "换一个城市", "换城市",
  "换一座城市", "另一座城市", "别的城市", "其他城市",
  "中国城市", "美国城市", "欧洲城市", "环球旅行",
];

export const CITY_PHRASES = NAMED_CITY_PHRASES.concat(TOUR_PHRASES);

const TRAVEL_MISHEARS = [
  "背景", "北景", "背影", "伤害", "商海", "航州", "程度", "成度", "先安",
  "重亲", "从庆", "巴里", "八里", "伦顿", "论敦", "罗玛", "维尼斯", "威尼司",
  "东经", "牛约", "纽月", "落杉矶", "洛山矶", "落山矶",
];

function mentionsPhrase(line, phrases) {
  const text = String(line || "");
  const low = text.toLowerCase();
  return phrases.some((phrase) => {
    if (/[\u4e00-\u9fff]/.test(phrase)) return text.includes(phrase);
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z])${escaped}(?:[^a-z]|$)`).test(low);
  });
}

export function mentionsNamedCity(line) {
  return mentionsPhrase(line, NAMED_CITY_PHRASES);
}

export function mentionsCity(line) {
  return mentionsPhrase(line, CITY_PHRASES);
}

// 去背景 / 到程度. A bare 伤害, with no 去 or 到 in front, is not a city.
export function mentionsTravelCity(line) {
  const text = String(line || "");
  return TRAVEL_MISHEARS.some((word) =>
    text.includes("去" + word) || text.includes("到" + word) || text.includes("前往" + word));
}

// A next-track sentence. 下一首 is not 下一个城市, and 换一首 is not 换场景.
export function mentionsSong(line) {
  const text = String(line || "");
  const low = text.toLowerCase();
  if (text.includes("场景") || text.includes("城市")) return false;
  if (text.includes("下一首") || text.includes("下首歌") || text.includes("换一首")
    || text.includes("换首歌") || text.includes("切歌") || text.includes("跳过这首")) return true;
  const word = (phrase) => new RegExp(`(?:^|[^a-z])${phrase}(?:[^a-z]|$)`).test(low);
  if (word("scene") || word("city") || word("biome")) return false;
  return (word("next") && (word("song") || word("track")))
    || (word("skip") && (word("song") || word("track") || word("music")));
}

export function preferHeard(alternatives) {
  const list = [];
  for (const raw of alternatives || []) {
    const line = String(raw || "").trim();
    if (line) list.push(line);
  }
  if (!list.length) return "";
  for (const line of list) {
    if (mentionsNamedCity(line)) return line;
  }
  for (const line of list) {
    if (mentionsTravelCity(line)) return line;
  }
  for (const line of list) {
    if (mentionsSong(line)) return line;
    if (mentionsCity(line)) return line;
  }
  return list[0];
}

export function missLine(error) {
  if (error === "not-allowed" || error === "service-not-allowed") return "请允许这个页面使用麦克风";
  if (error === "audio-capture") return "麦克风没有声音";
  if (error === "network") return "语音服务连不上";
  if (error === "language-not-supported") return "这个浏览器听不了中文";
  return "没听清，按住空格再说久一点";
}

function altsOf(part) {
  if (!part) return [];
  const out = [];
  const n = typeof part.length === "number" ? part.length : 0;
  for (let j = 0; j < n; j++) {
    const alt = typeof part.item === "function" ? part.item(j) : part[j];
    const bit = alt && alt.transcript;
    if (bit && String(bit).trim()) out.push(String(bit));
  }
  if (!out.length && part[0] && part[0].transcript) out.push(String(part[0].transcript));
  return out;
}

export function installWish({ send, onSong }) {
  const saidEl = document.getElementById("said");
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let listening = false;
  let release = false;
  let draft = "";
  let interim = "";
  let heardError = "";
  let rec = null;
  let epoch = 0;
  let settle = 0;
  let stopTimer = 0;
  const hook = { started: 0, sent: 0 };
  window.__lumenWish = hook;

  function show(text) {
    const clean = String(text || "").trim();
    const body = document.getElementById("said-body");
    const kicker = document.getElementById("said-kicker");
    if (!saidEl) return;
    if (!clean) {
      saidEl.hidden = true;
      if (body) body.textContent = "";
      else saidEl.textContent = "";
      document.documentElement.dataset.wish = "";
      return;
    }
    saidEl.hidden = false;
    if (kicker) kicker.textContent = "";
    if (body) body.textContent = clean;
    else saidEl.textContent = clean;
    document.documentElement.dataset.wish = clean;
  }

  function heard() {
    return (draft || interim || "").trim().slice(0, 80);
  }

  function clearTimers() {
    clearTimeout(settle);
    clearTimeout(stopTimer);
    settle = 0;
    stopTimer = 0;
  }

  function halt() {
    const engine = rec;
    if (!engine) return;
    try { engine.stop(); } catch { /* already ended */ }
  }

  function submit() {
    if (!release) return;
    release = false;
    clearTimers();
    const clean = heard();
    const err = heardError;
    draft = "";
    interim = "";
    heardError = "";
    halt();
    if (!clean) {
      show(missLine(err));
      return;
    }
    if (typeof onSong === "function" && mentionsSong(clean)) onSong(clean);
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

  function armSettle() {
    clearTimeout(settle);
    // The final transcript often arrives after onend, especially on a
    // short hold. An empty submit before that looks like 没听清.
    settle = setTimeout(submit, 800);
  }

  function ensureRec() {
    if (!Ctor) return null;
    epoch += 1;
    const mine = epoch;
    if (rec) {
      const old = rec;
      rec = null;
      old.onresult = null;
      old.onerror = null;
      old.onend = null;
      try { old.abort(); } catch { /* already ended */ }
    }
    const engine = new Ctor();
    rec = engine;
    engine.continuous = true;
    engine.interimResults = true;
    engine.lang = "zh-CN";
    // Do not set engine.phrases. Chrome only accepts that list for
    // on-device recognition, and zh-CN then fails every session.
    engine.onresult = (ev) => {
      if (mine !== epoch) return;
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
      if (release && line) submit();
    };
    engine.onerror = (ev) => {
      if (mine !== epoch) return;
      const code = ev && ev.error ? String(ev.error) : "";
      // stop() ends the session with aborted. That is not a miss.
      if (code === "aborted" || code === "no-speech") return;
      if (code) heardError = code;
      listening = false;
    };
    engine.onend = () => {
      if (mine !== epoch) return;
      listening = false;
      if (rec === engine) rec = null;
      if (release) armSettle();
    };
    return engine;
  }

  function start() {
    if (!Ctor) {
      show("这个浏览器听不见");
      return;
    }
    clearTimers();
    if (listening) {
      release = false;
      heardError = "";
      return;
    }
    const engine = ensureRec();
    if (!engine) return;
    draft = "";
    interim = "";
    heardError = "";
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
      if (rec === engine) rec = null;
      show(missLine("start"));
    }
  }

  function stop() {
    if (!Ctor || (!listening && !rec && !release)) return;
    release = true;
    clearTimeout(stopTimer);
    // A release in the same instant as the last syllable drops the audio.
    stopTimer = setTimeout(() => {
      stopTimer = 0;
      if (!rec || !listening) {
        if (heard()) submit();
        else armSettle();
        return;
      }
      try { rec.stop(); } catch {
        listening = false;
        submit();
      }
    }, 400);
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
