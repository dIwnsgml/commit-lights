// Commit Lights: the lights builder. MIT License, (c) 2026 Jason Lee. https://commitlights.e5d.workers.dev
//
// A pure function (calendar, options) -> SVG string. No dependencies, no DOM, no fonts, no network.
// This is the same builder that draws the hosted README image; given the same calendar and options it
// produces the same bytes. It runs in Node 18+, browsers, Deno, Bun and edge runtimes.
//
// Drawing notes:
// - 53 weeks x 7 days on a fixed 16 x 19 px pitch, so it still reads as a contribution graph.
// - One serpentine wire, hooks at month boundaries, a C9-style bulb per day. Level 0 = unlit glass.
// - Motion: a one-time left-to-right "plug-in" sweep of the glow (1.2s), then every lit bulb twinkles: the glass dips
//   to 45% opacity and its halo to 10%, on 2.4-4.2s cycles with staggered phases so neighbours sparkle out of step.
//   Opacity only, at most 0.42 Hz per bulb. With CSS stripped the image is the finished, full-bright picture.
//   `prefers-reduced-motion: reduce` stops everything; `motion: false` drops the <style> block entirely.
// - All text uses a system font stack or outlined paths, because an SVG inside <img> can't load fonts.

/**
 * @typedef {"night" | "light" | "dark"} Theme
 *   night = dark palette on its own #0A0E1A rounded panel (default; reads on any background).
 *   dark / light = transparent background, for GitHub's `<picture>` + `prefers-color-scheme`.
 * @typedef {"classic" | "warm" | "candy"} Style
 *   classic = red / orange / green / blue, warm = warm white, candy = candy cane (red / white).
 *
 * @typedef {Object} Calendar
 * @property {string} start  First day, YYYY-MM-DD. Must be a Sunday (column = week, row = weekday).
 * @property {string} levels One char per day from `start`, oldest first: "0"-"4", or "." for padding days
 *                           before a partial first week (drawn as wire only). Anything else counts as 0.
 * @property {number[]} counts Daily contribution counts, same length as `levels` (padding = 0).
 * @property {number} total  Total contributions, shown in the footer.
 *
 * @typedef {Object} LightsOptions
 * @property {Theme}   [theme="night"]
 * @property {Style}   [style="classic"]
 * @property {boolean} [motion=true]   false = static SVG with no <style> block.
 * @property {string}  [user]          Shown as "@user" in the footer and <title> (XML-escaped).
 * @property {string}  [label]         Replaces the footer-left text entirely.
 * @property {boolean} [footer=true]   Footer line + the `commitlights` wordmark tag.
 * @property {boolean} [unlit=false]   Draw every bulb at level 0 ("lights off").
 * @property {string}  [seed]          Twinkle-subset seed (default: user + last date).
 * @property {number}  [from]          First week to draw (slice).
 * @property {number}  [to]            Week to stop before (slice).
 * @property {number}  [maxTwinkle]     Upper bound on twinkling bulbs (default: every lit bulb).
 */

export const BUILDER_VERSION = 2;
/** @type {readonly Theme[]} */
export const THEMES = ["night", "light", "dark"];
/** @type {readonly Style[]} */
export const STYLES = ["classic", "warm", "candy"];

// ---------- colour: OKLCH -> sRGB hex, chroma reduced until it fits the gamut ----------
function toRgb(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  if (lin.some((v) => v < -1e-4 || v > 1 + 1e-4)) return null;
  return lin.map((v) => { v = Math.min(1, Math.max(0, v)); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; });
}
const hex = (rgb) => "#" + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
/** OKLCH (L 0-1, C, hue in degrees) -> "#RRGGBB", chroma-reduced into sRGB. */
export function oklch(L, C, h) {
  for (let c = C; c >= 0; c -= 0.002) { const r = toRgb(L, c, h); if (r) return hex(r); }
  return hex(toRgb(L, 0, h) ?? [0, 0, 0]);
}

// ---------- palette ----------
// hue in degrees; null = neutral white (candy cane's white bulbs)
const HUES = { classic: [27, 68, 150, 255], warm: [72], candy: [27, null] };
const RAMP = {
  dark: { body: [[0.34, 0.035], [0.6, 0.13], [0.74, 0.16], [0.86, 0.13], [0.97, 0.04]], halo: [null, null, [0.72, 0.17, 0.45, 7], [0.76, 0.17, 0.65, 9], [0.82, 0.16, 0.9, 11.5]] },
  light: { body: [[0.91, 0.012], [0.84, 0.08], [0.73, 0.145], [0.63, 0.18], [0.54, 0.2]], halo: [null, null, [0.8, 0.12, 0.35, 7], [0.76, 0.15, 0.45, 9], [0.72, 0.17, 0.6, 11.5]] },
};
const WARM_C = 0.6;
/** Wire, caps, hooks and text colours per background mode. */
export const CHROME = {
  dark: { wire: "#2F4A3A", cap: "#4A5560", hook: "#5C6B63", unlitStroke: "#3D4651", text: "#8B949E", tag: "#C9D1D9" },
  light: { wire: "#7E9A88", cap: "#8C959F", hook: "#6E8576", unlitStroke: "#C3CAD1", text: "#59636E", tag: "#1F2328" },
};
export const NIGHT_BG = "#0A0E1A";
const palMemo = new Map();
/**
 * Bulb colours: [hue][level] -> { body, halo: { c, o, r } | null }. Memoised.
 * @param {"dark" | "light"} mode
 * @param {Style} style
 */
export function bulbColors(mode, style) {
  const key = mode + style;
  const hit = palMemo.get(key);
  if (hit) return hit;
  const out = HUES[style].map((h) => {
    const k = h === null ? 0 : style === "warm" && mode === "dark" ? WARM_C : 1;
    const hue = h ?? 0;
    return RAMP[mode].body.map(([L, C], i) => {
      const hl = RAMP[mode].halo[i];
      return { body: oklch(L, C * (i === 0 && h !== null ? 1 : k), hue), halo: hl ? { c: oklch(hl[0], hl[1] * k, hue), o: hl[2], r: hl[3] } : null };
    });
  });
  palMemo.set(key, out);
  return out;
}

// ---------- helpers ----------
/** @param {string} s */
export const escXml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** 1120 -> "1,120" */
export const fmtInt = (n) => String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const DAY_MS = 86_400_000;
/** "2026-01-04" + 7 -> "2026-01-11" (UTC). */
export const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
/** FNV-1a 32-bit hash (seeds the deterministic twinkle subset). */
export function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const mix = (n) => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return (n ^ (n >>> 15)) >>> 0; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BODY = "M-2.3 2.6C-4.7 3.9-4.6 8.4-1.7 11.8Q0 13.6 1.7 11.8C4.6 8.4 4.7 3.9 2.3 2.6Z"; // C9 teardrop, origin = wire point
const FONT = `font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif"`;
const PX = 16, PY = 19, X0 = 20, Y0 = 30;
/** Intrinsic size in px for a given number of weeks (53 weeks with footer = 888 x 196). */
export const svgSize = (weeks = 53, footer = true) => ({ w: X0 * 2 + weeks * PX, h: footer ? 196 : 172 });

/** Level of day i (0-4), clamped; garbage -> 0. */
const lv = (levels, i) => { const n = levels.charCodeAt(i) - 48; return n >= 0 && n <= 4 ? n : 0; };

/**
 * Build the lights SVG.
 * @param {Calendar} cal
 * @param {LightsOptions} [o]
 * @returns {string} a standalone SVG document (no scripts, no external references)
 */
export function buildLightsSvg(cal, o = {}) {
  const theme = o.theme ?? "night", style = o.style ?? "classic", motion = o.motion ?? true, footer = o.footer ?? true;
  const mode = theme === "light" ? "light" : "dark";
  const C = CHROME[mode], pal = bulbColors(mode, style);
  const nDays = Math.min(cal.levels.length, 371);
  const allWeeks = Math.max(1, Math.ceil(nDays / 7));
  const w0 = Math.max(0, o.from ?? 0), w1 = Math.min(allWeeks, o.to ?? allWeeks);
  const weeks = Math.max(1, w1 - w0);
  const { w: W, h: H } = svgSize(weeks, footer);
  const weekDate = (c) => addDays(cal.start, (w0 + c) * 7);
  // hooks at month boundaries (first week whose Sunday is in a new month) -> scallop spans
  const hooks = [0], labels = [];
  let pm = -1;
  for (let c = 0; c < weeks; c++) {
    const m = +weekDate(c).slice(5, 7) - 1;
    if (m !== pm) { if (c) hooks.push(c); if (c < weeks - 2) labels.push([c, MONTHS[m]]); }
    pm = m;
  }
  hooks.push(weeks);
  for (let i = labels.length - 2; i >= 0; i--) if (labels[i + 1][0] - labels[i][0] < 3) labels.splice(i, 1);
  const xOf = (c) => X0 + c * PX + PX / 2, hookX = (c) => X0 + c * PX;
  const segOf = (c) => { let k = 0; while (k < hooks.length - 2 && c >= hooks[k + 1]) k++; return k; };
  const sagAt = (x) => {
    for (let i = 0; i < hooks.length - 1; i++) {
      const a = hookX(hooks[i]), b = hookX(hooks[i + 1]);
      if (x >= a && x <= b) { const t = (x - a) / (b - a), s = Math.min(4, (b - a) * 0.06); return 4 * s * t * (1 - t); }
    }
    return 0;
  };
  // one serpentine wire: row 0 L->R, row 1 R->L, ...
  let wire = "";
  for (let r = 0; r < 7; r++) {
    const y = Y0 + r * PY, ltr = r % 2 === 0;
    const seq = hooks.map(hookX);
    if (!ltr) seq.reverse();
    if (r === 0) wire += `M${seq[0] - 6} ${y}L${seq[0]} ${y}`;
    for (let i = 0; i < seq.length - 1; i++) { const a = seq[i], b = seq[i + 1], s = Math.min(4, Math.abs(b - a) * 0.06); wire += `Q${(a + b) / 2} ${y + 2 * s} ${b} ${y}`; }
    if (r < 6) { const ex = seq[seq.length - 1], dx = ltr ? 9 : -9; wire += `C${ex + dx * 1.4} ${y} ${ex + dx * 1.4} ${y + PY} ${ex} ${y + PY}`; }
    else wire += `L${seq[seq.length - 1] + 8} ${y}`;
  }
  const plugX = hookX(hooks[hooks.length - 1]) + 8, plugY = Y0 + 6 * PY;
  // defs: one symbol per hue x level
  let defs = `<path id="p" d="${BODY}"/>`;
  pal.forEach((lvls, h) => lvls.forEach((v, l) => {
    if (v.halo) defs += `<radialGradient id="g${h}${l}"><stop offset="0" stop-color="${v.halo.c}" stop-opacity="${v.halo.o}"/><stop offset="1" stop-color="${v.halo.c}" stop-opacity="0"/></radialGradient>`;
    defs += `<g id="b${h}${l}"><use href="#p" fill="${v.body}"${l === 0 ? ` stroke="${C.unlitStroke}" stroke-width=".8"` : ""}/><rect x="-1.9" y="-.6" width="3.8" height="3.6" rx=".7" fill="${C.cap}"/>${l >= 2 ? `<ellipse cx="-1.3" cy="5.6" rx=".9" ry="1.6" fill="#fff" opacity="${mode === "dark" ? 0.5 : 0.65}"/>` : ""}</g>`;
  }));
  // bulbs + halos. Halos are grouped per month segment so the plug-in sweep animates a <g> (cheap, few rules).
  const segHalos = hooks.slice(0, -1).map(() => "");
  const litList = [];
  for (let c = 0; c < weeks; c++) for (let r = 0; r < 7; r++) {
    const i = (w0 + c) * 7 + r;
    // future days of the current week, and padding days before a partial first week ("."): wire only, no bulb
    if (i >= nDays || cal.levels[i] === ".") continue;
    const x = xOf(c), y = (Y0 + r * PY + sagAt(x)).toFixed(1), h = (c + 2 * r) % pal.length, l = o.unlit ? 0 : lv(cal.levels, i);
    litList.push({ c, r, x, y, h, l });
  }
  // deterministic twinkle subset over lit bulbs (level >= 1): at most maxTwinkle (default: all), chosen by hash(seed, position).
  // A twinkling bulb and its halo share one phase class t0-t8, so the glow dips with the glass.
  const lit = litList.flatMap((b, k) => (b.l >= 1 ? [k] : []));
  const maxTw = o.maxTwinkle ?? lit.length;
  const seed = fnv(o.seed ?? `${o.user ?? ""}|${addDays(cal.start, Math.max(0, nDays - 1))}`);
  let twinkle = null;
  if (motion) {
    if (lit.length > maxTw) {
      const key = (k) => mix(seed ^ (litList[k].c * 7 + litList[k].r));
      twinkle = new Set([...lit].sort((a, b) => key(a) - key(b) || a - b).slice(0, Math.max(0, maxTw)));
    } else twinkle = new Set(lit);
  }
  let bulbs = "";
  litList.forEach((b, k) => {
    const cls = twinkle?.has(k) ? ` class="t${mix(b.c * 7 + b.r) % 9}"` : "";
    bulbs += `<use${cls} href="#b${b.h}${b.l}" x="${b.x}" y="${b.y}"/>`;
    if (b.l >= 2) segHalos[segOf(b.c)] += `<circle${cls} cx="${b.x}" cy="${(+b.y + 7.5).toFixed(1)}" r="${pal[b.h][b.l].halo.r}" fill="url(#g${b.h}${b.l})"/>`;
  });
  const halos = segHalos.map((s, k) => (s ? (motion ? `<g class="s${k}">${s}</g>` : s) : "")).join("");
  const hookDots = hooks.flatMap((k) => [0, 1, 2, 3, 4, 5, 6].map((r) => `<circle cx="${hookX(k)}" cy="${Y0 + r * PY}" r="1.3"/>`)).join("");
  // twinkle: 9 phase classes = 3 periods (2.4 / 3.3 / 4.2s, at most 0.42 Hz, far under WCAG 2.3.1's 3 flashes/s) x 3
  // evenly spread negative delays. Opacity only, smooth ramps (never a hard on/off), and a dip rather than a full-cycle
  // pulse, so the string reads full-bright while a scattered third of the bulbs dim at any moment.
  // `.tN` sets the animation shorthand (timing); `use[class]` / `circle[class]` set only animation-name, so the
  // higher-specificity element rules never reset the per-class duration and delay. Sweep: 1.2s total.
  const dur = [2.4, 3.3, 4.2];
  const css = motion
    ? `@keyframes tb{0%,30%,100%{opacity:1}65%{opacity:.45}}@keyframes th{0%,30%,100%{opacity:1}65%{opacity:.1}}@keyframes on{from{opacity:0}}`
      + [...Array(9)].map((_, i) => `.t${i}{animation:${dur[i % 3]}s ease-in-out ${(-(dur[i % 3] * ((i * 4) % 9)) / 9).toFixed(2)}s infinite}`).join("")
      + `use[class]{animation-name:tb}circle[class]{animation-name:th}g[class]{animation:on .5s ease-out backwards}`
      + hooks.slice(0, -1).map((hk, k) => `g.s${k}{animation-delay:${((1.2 * hk) / weeks).toFixed(2)}s}`).join("")
      + `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`
    : "";
  const ws = 13 / 100, tagW = WM.width * ws, tagX = W - 16 - tagW, tagY = H - 11;
  const dots = WM.dots.map((d, i) => `<circle cx="${(tagX + d.cx * ws).toFixed(1)}" cy="${(tagY + d.cy * ws).toFixed(1)}" r="${(d.r * ws * 1.25).toFixed(2)}" fill="${["#F66D62", "#F4B93C"][i]}"/>`).join("");
  const user = o.user ? escXml(o.user) : "";
  const foot = o.label !== undefined ? escXml(o.label) : `${user ? `@${user} · ` : ""}${fmtInt(cal.total)} contributions in the last year`;
  const title = `${user ? `@${user}’s ` : ""}contribution graph as Christmas lights · commitlights`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t"><title id="t">${title}</title>`
    + (css ? `<style>${css}</style>` : "") + `<defs>${defs}</defs>`
    + (theme === "night" ? `<rect width="${W}" height="${H}" rx="10" fill="${NIGHT_BG}"/>` : "")
    + `<g ${FONT} font-size="10" fill="${C.text}">${labels.map(([c, m]) => `<text x="${hookX(c) + 2}" y="14">${m}</text>`).join("")}</g>`
    + `<path d="${wire}" fill="none" stroke="${C.wire}" stroke-width="1.4" stroke-linecap="round"/>`
    + `<rect x="${plugX}" y="${plugY - 3}" width="7" height="6" rx="1.5" fill="${C.cap}"/><path d="M${plugX + 7} ${plugY - 1.6}h3M${plugX + 7} ${plugY + 1.6}h3" stroke="${C.cap}" stroke-width="1.1"/>`
    + `<g fill="${C.hook}">${hookDots}</g><g>${halos}</g><g>${bulbs}</g>`
    + (footer ? `<text ${FONT} font-size="11" x="${X0}" y="${H - 12}" fill="${C.text}">${foot}</text>`
      + `<path d="${WM.d}" transform="translate(${tagX.toFixed(1)} ${tagY}) scale(${ws})" fill="${C.tag}"/>${dots}` : "")
    + `</svg>`;
}

// ---------- calendars ----------
/**
 * Quartile levels like GitHub's, from raw daily counts (GitHub's own data already carries levels; this is for
 * synthetic or self-collected counts).
 * @param {string} start first day, YYYY-MM-DD (a Sunday)
 * @param {number[]} counts daily counts, oldest first
 * @returns {Calendar}
 */
export function fromCounts(start, counts) {
  const nz = counts.filter(Boolean).sort((a, b) => a - b);
  const q = (k) => nz[Math.floor(nz.length * k)] ?? 0;
  const levels = counts.map((c) => (c === 0 ? 0 : c <= q(0.25) ? 1 : c <= q(0.5) ? 2 : c <= q(0.75) ? 3 : 4)).join("");
  return { start, levels, counts, total: counts.reduce((a, b) => a + b, 0) };
}

/**
 * The deterministic synthetic year behind `_sample` (the demo string). Sunday-aligned, ending on `end`.
 * @param {string} end last day, YYYY-MM-DD
 * @param {number} [seed=7]
 * @param {number} [busy=1] activity multiplier
 * @returns {Calendar}
 */
export function sampleCalendar(end, seed = 7, busy = 1) {
  let s = seed;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const endMs = Date.parse(end + "T00:00:00Z"), endDow = new Date(endMs).getUTCDay();
  const startMs = endMs - (364 + endDow) * DAY_MS;
  const counts = [];
  for (let t = startMs, i = 0; t <= endMs; t += DAY_MS, i++) {
    const wd = new Date(t).getUTCDay(), wk = Math.floor(i / 7), vac = (wk > 30 && wk < 33) || wk === 4;
    const p = (wd === 0 || wd === 6 ? 0.25 : 0.75) * busy * (vac ? 0.05 : 1) * (0.6 + 0.6 * Math.sin(wk / 6));
    counts.push(rnd() < p ? Math.ceil(rnd() ** 2 * 18 * busy + (rnd() < 0.04 ? 25 : 0)) : 0);
  }
  return fromCounts(new Date(startMs).toISOString().slice(0, 10), counts);
}

/** Today (UTC) as YYYY-MM-DD. */
export const utcDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

// ---------- login + hosted snippet ----------
/** GitHub's login rule (case-insensitive). */
export const LOGIN_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
/**
 * Accepts "name", "@name", "github.com/name" or a full profile URL. Returns the lowercase login or null.
 * @param {string} raw
 */
export function normalizeLogin(raw) {
  let s = raw.trim();
  s = s.replace(/^https?:\/\//i, "").replace(/^(www\.)?github\.com\//i, "").replace(/^@/, "").split(/[/?#]/)[0] ?? "";
  return LOGIN_RE.test(s) ? s.toLowerCase() : null;
}

/**
 * The hosted README snippets for a login (the same strings the site's Copy button produces).
 * @param {string} host e.g. "commitlights.e5d.workers.dev"
 * @param {string} login a normalised login
 * @param {Style} [style="classic"]
 */
export function snippets(host, login, style = "classic") {
  const base = `https://${host}`;
  const st = style === "classic" ? "" : `?style=${style}`;
  const pic = (theme) => `${base}/api/lights/${login}.svg?theme=${theme}${style === "classic" ? "" : `&style=${style}`}`;
  const link = `${base}/?u=${login}&utm_source=readme&utm_medium=embed&utm_campaign=s1`;
  const alt = `@${login}'s contributions as Christmas lights`;
  return {
    markdown: `[![${alt}](${base}/api/lights/${login}.svg${st})](${link})`,
    picture: `<a href="${link}">\n  <picture>\n    <source media="(prefers-color-scheme: dark)" srcset="${pic("dark")}">\n    <img alt="${alt}" src="${pic("light")}">\n  </picture>\n</a>`,
  };
}

// ---------- the `commitlights` wordmark tag (Space Grotesk 700, outlined to paths; no font needed) ----------
const WM = {"d":"M30.3 1.4L30.3 1.4Q23.1 1.4 17.3 -1.6Q11.4 -4.6 8.0 -10.3Q4.6 -16.0 4.6 -24.1L4.6 -24.1L4.6 -25.5Q4.6 -33.6 8.0 -39.3Q11.4 -45.0 17.3 -48.0Q23.1 -51.0 30.3 -51.0L30.3 -51.0Q37.4 -51.0 42.5 -48.5Q47.6 -46.0 50.8 -41.7Q53.9 -37.3 54.9 -31.8L54.9 -31.8L42.7 -29.2Q42.3 -32.2 40.9 -34.6Q39.5 -37.0 37.0 -38.4Q34.4 -39.8 30.6 -39.8L30.6 -39.8Q26.8 -39.8 23.8 -38.1Q20.7 -36.5 18.9 -33.3Q17.2 -30.0 17.2 -25.3L17.2 -25.3L17.2 -24.3Q17.2 -19.6 18.9 -16.4Q20.7 -13.1 23.8 -11.5Q26.8 -9.8 30.6 -9.8L30.6 -9.8Q36.3 -9.8 39.3 -12.8Q42.2 -15.7 43.0 -20.5L43.0 -20.5L55.2 -17.6Q53.9 -12.3 50.8 -8.0Q47.6 -3.6 42.5 -1.1Q37.4 1.4 30.3 1.4M89.2 1.4L89.2 1.4Q81.8 1.4 75.9 -1.6Q70.0 -4.6 66.6 -10.3Q63.2 -16.0 63.2 -24.0L63.2 -24.0L63.2 -25.6Q63.2 -33.6 66.6 -39.3Q70.0 -45.0 75.9 -48.0Q81.8 -51.0 89.2 -51.0L89.2 -51.0Q96.6 -51.0 102.5 -48.0Q108.4 -45.0 111.8 -39.3Q115.2 -33.6 115.2 -25.6L115.2 -25.6L115.2 -24.0Q115.2 -16.0 111.8 -10.3Q108.4 -4.6 102.5 -1.6Q96.6 1.4 89.2 1.4M89.2 -9.8L89.2 -9.8Q95.0 -9.8 98.8 -13.6Q102.6 -17.3 102.6 -24.3L102.6 -24.3L102.6 -25.3Q102.6 -32.3 98.8 -36.1Q95.1 -39.8 89.2 -39.8L89.2 -39.8Q83.4 -39.8 79.6 -36.1Q75.8 -32.3 75.8 -25.3L75.8 -25.3L75.8 -24.3Q75.8 -17.3 79.6 -13.6Q83.4 -9.8 89.2 -9.8M139.4 0.0L126.8 0.0L126.8 -49.6L139.2 -49.6L139.2 -44.2L141.0 -44.2Q142.3 -46.7 145.3 -48.6Q148.3 -50.4 153.2 -50.4L153.2 -50.4Q158.5 -50.4 161.7 -48.4Q164.9 -46.3 166.6 -43.0L166.6 -43.0L168.4 -43.0Q170.1 -46.2 173.2 -48.3Q176.3 -50.4 182.0 -50.4L182.0 -50.4Q186.6 -50.4 190.4 -48.5Q194.1 -46.5 196.4 -42.6Q198.6 -38.6 198.6 -32.6L198.6 -32.6L198.6 0.0L186.0 0.0L186.0 -31.7Q186.0 -35.8 183.9 -37.9Q181.8 -39.9 178.0 -39.9L178.0 -39.9Q173.7 -39.9 171.4 -37.1Q169.0 -34.4 169.0 -29.3L169.0 -29.3L169.0 0.0L156.4 0.0L156.4 -31.7Q156.4 -35.8 154.3 -37.9Q152.2 -39.9 148.4 -39.9L148.4 -39.9Q144.1 -39.9 141.8 -37.1Q139.4 -34.4 139.4 -29.3L139.4 -29.3L139.4 0.0M224.8 0.0L212.2 0.0L212.2 -49.6L224.6 -49.6L224.6 -44.2L226.4 -44.2Q227.7 -46.7 230.7 -48.6Q233.7 -50.4 238.6 -50.4L238.6 -50.4Q243.9 -50.4 247.1 -48.4Q250.3 -46.3 252.0 -43.0L252.0 -43.0L253.8 -43.0Q255.5 -46.2 258.6 -48.3Q261.7 -50.4 267.4 -50.4L267.4 -50.4Q272.0 -50.4 275.8 -48.5Q279.5 -46.5 281.8 -42.6Q284.0 -38.6 284.0 -32.6L284.0 -32.6L284.0 0.0L271.4 0.0L271.4 -31.7Q271.4 -35.8 269.3 -37.9Q267.2 -39.9 263.4 -39.9L263.4 -39.9Q259.1 -39.9 256.8 -37.1Q254.4 -34.4 254.4 -29.3L254.4 -29.3L254.4 0.0L241.8 0.0L241.8 -31.7Q241.8 -35.8 239.7 -37.9Q237.6 -39.9 233.8 -39.9L233.8 -39.9Q229.5 -39.9 227.2 -37.1Q224.8 -34.4 224.8 -29.3L224.8 -29.3L224.8 0.0M310.2 0.0L297.6 0.0L297.6 -49.6L310.2 -49.6L310.2 0.0M357.2 0.0L343.2 0.0Q338.3 0.0 335.3 -3.1Q332.2 -6.1 332.2 -11.2L332.2 -11.2L332.2 -39.2L319.8 -39.2L319.8 -49.6L332.2 -49.6L332.2 -65.0L344.8 -65.0L344.8 -49.6L358.4 -49.6L358.4 -39.2L344.8 -39.2L344.8 -13.4Q344.8 -10.4 347.6 -10.4L347.6 -10.4L357.2 -10.4L357.2 0.0M382.4 0.0L369.8 0.0L369.8 -70.0L382.4 -70.0L382.4 0.0M409.0 0.0L396.4 0.0L396.4 -49.6L409.0 -49.6L409.0 0.0M420.6 -24.6L420.6 -24.6L420.6 -26.2Q420.6 -34.0 423.7 -39.6Q426.8 -45.1 432.0 -48.1Q437.1 -51.0 443.2 -51.0L443.2 -51.0Q450.0 -51.0 453.5 -48.6Q457.0 -46.2 458.6 -43.6L458.6 -43.6L460.4 -43.6L460.4 -49.6L472.8 -49.6L472.8 8.8Q472.8 13.9 469.8 16.9Q466.8 20.0 461.8 20.0L461.8 20.0L428.6 20.0L428.6 9.0L457.4 9.0Q460.2 9.0 460.2 6.0L460.2 6.0L460.2 -6.9L458.4 -6.9Q457.4 -5.3 455.6 -3.7Q453.8 -2.0 450.8 -0.9Q447.8 0.2 443.2 0.2L443.2 0.2Q437.1 0.2 432.0 -2.8Q426.8 -5.7 423.7 -11.3Q420.6 -16.8 420.6 -24.6M446.8 -10.8L446.8 -10.8Q452.6 -10.8 456.5 -14.5Q460.4 -18.2 460.4 -24.9L460.4 -24.9L460.4 -25.9Q460.4 -32.7 456.6 -36.4Q452.7 -40.0 446.8 -40.0L446.8 -40.0Q441.0 -40.0 437.1 -36.4Q433.2 -32.7 433.2 -25.9L433.2 -25.9L433.2 -24.9Q433.2 -18.2 437.1 -14.5Q441.0 -10.8 446.8 -10.8M499.4 0.0L486.8 0.0L486.8 -70.0L499.4 -70.0L499.4 -43.5L501.2 -43.5Q502.0 -45.1 503.7 -46.7Q505.4 -48.3 508.3 -49.4Q511.1 -50.4 515.5 -50.4L515.5 -50.4Q521.3 -50.4 525.7 -47.8Q530.0 -45.1 532.4 -40.5Q534.8 -35.8 534.8 -29.6L534.8 -29.6L534.8 0.0L522.2 0.0L522.2 -28.6Q522.2 -34.2 519.5 -37.0Q516.7 -39.8 511.6 -39.8L511.6 -39.8Q505.8 -39.8 502.6 -36.0Q499.4 -32.1 499.4 -25.2L499.4 -25.2L499.4 0.0M580.0 0.0L566.0 0.0Q561.1 0.0 558.1 -3.1Q555.0 -6.1 555.0 -11.2L555.0 -11.2L555.0 -39.2L542.6 -39.2L542.6 -49.6L555.0 -49.6L555.0 -65.0L567.6 -65.0L567.6 -49.6L581.2 -49.6L581.2 -39.2L567.6 -39.2L567.6 -13.4Q567.6 -10.4 570.4 -10.4L570.4 -10.4L580.0 -10.4L580.0 0.0M613.2 1.4L613.2 1.4Q603.5 1.4 597.3 -2.8Q591.1 -7.0 589.8 -14.8L589.8 -14.8L601.4 -17.8Q602.1 -14.3 603.8 -12.3Q605.4 -10.3 607.9 -9.5Q610.3 -8.6 613.2 -8.6L613.2 -8.6Q617.6 -8.6 619.7 -10.2Q621.8 -11.7 621.8 -14.0L621.8 -14.0Q621.8 -16.3 619.8 -17.6Q617.8 -18.8 613.4 -19.6L613.4 -19.6L610.6 -20.1Q605.4 -21.1 601.1 -22.9Q596.8 -24.6 594.2 -27.7Q591.6 -30.8 591.6 -35.7L591.6 -35.7Q591.6 -43.1 597.0 -47.1Q602.4 -51.0 611.2 -51.0L611.2 -51.0Q619.5 -51.0 625.0 -47.3Q630.5 -43.6 632.2 -37.6L632.2 -37.6L620.5 -34.0Q619.7 -37.8 617.3 -39.4Q614.8 -41.0 611.2 -41.0L611.2 -41.0Q607.6 -41.0 605.7 -39.8Q603.8 -38.5 603.8 -36.3L603.8 -36.3Q603.8 -33.9 605.8 -32.8Q607.8 -31.6 611.2 -31.0L611.2 -31.0L614.0 -30.5Q619.6 -29.5 624.2 -27.9Q628.7 -26.2 631.4 -23.2Q634.0 -20.1 634.0 -14.9L634.0 -14.9Q634.0 -7.1 628.4 -2.9Q622.7 1.4 613.2 1.4","width":638,"dots":[{"cx":303.9,"cy":-63.4,"r":8.1},{"cx":402.7,"cy":-63.4,"r":8.1}]};
