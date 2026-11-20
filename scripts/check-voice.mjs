// The spoken sun, moon and plane are a fixed picture. The shader disc
// stays soft until a wish turns it up, and a spoken removal turns it off.
// The soft music voice is chosen once and does not hop pitch.
import { visibleSky } from "../web/render.mjs";
import { showBox } from "../web/thing.mjs";
import { SESSION_VOICE, voiceForBeat } from "../web/audio.mjs";

let failed = 0;
function check(name, ok) {
  if (!ok) {
    failed += 1;
    console.error("fail", name);
  } else {
    console.log("ok", name);
  }
}

const soft = visibleSky([], false);
check("soft", soft.shader === 1 && !soft.sun && !soft.moon && !soft.plane);

const sun = visibleSky(["sun"], false);
check("sun", sun.sun && !sun.moon && !sun.plane && sun.shader === 1.7);

const off = visibleSky([], true);
check("off", !off.sun && off.shader === 0);

const back = visibleSky(["sun"], true);
check("back", back.sun && back.shader === 1.7);

const all = visibleSky(["sun", "moon", "plane", "nope", "sun"], false);
check("all", all.sun && all.moon && all.plane);

const empty = visibleSky(null, false);
check("empty", empty.shader === 1 && !empty.sun);

const jump = showBox({ role: "jump", size: 0.4 }, 0);
check("box-jump", jump.lat === -3.6 && jump.ahead === 5.5 && jump.h === 0.4 && jump.y === 0);

const slide = showBox({ role: "slide", size: 0.8 }, 1);
check("box-slide", slide.lat === 3.6 && slide.ahead === 8.5 && slide.w === 1.4);

const decor = showBox({ role: "decor", size: 1.2 }, 2);
check("box-decor", decor.lat === -3.6 && decor.ahead === 11.5 && Math.abs(decor.h - 1.62) < 1e-9);

const beats = [0, 1, 2, 7, 40, 200, 1000];
const voices = beats.map((n) => voiceForBeat(n));
check("voice-once", voices.every((v) =>
  v.name === SESSION_VOICE.name
  && v.type === SESSION_VOICE.type
  && v.freq === SESSION_VOICE.freq
  && v.pitch === SESSION_VOICE.pitch
  && v.freq === 196
  && v.pitch === 1));

if (failed) process.exit(1);
