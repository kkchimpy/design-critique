/* dc. vanilla client — Figma landing (home) + index.html verdicts engine. No deps. */
(() => {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const KEY = "llm_council_openrouter_key";
const SETTINGS_KEY = "llm_council_review_settings";
const state = { convId: null, conv: null, image: null, loading: false, phase: "" };
let vxMode = "home"; // 'home' (landing) | 'stack' (analysing/verdict) | 'full' (preview/details) | 'list' (band history)

/* ── review settings (same storage keys as the React SetupModal) ── */
const DEFAULT_SETTINGS = { customContext: "", contextFiles: [] };
function getReviewSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return { ...DEFAULT_SETTINGS, ...saved,
      contextFiles: Array.isArray(saved.contextFiles) ? saved.contextFiles : [] };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveReviewSettings(s) {
  const next = { ...DEFAULT_SETTINGS,
    customContext: typeof s.customContext === "string" ? s.customContext : "",
    contextFiles: Array.isArray(s.contextFiles) ? s.contextFiles : [] };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}
function getReviewContext(s = getReviewSettings()) {
  const files = s.contextFiles.map((f) => `===== CUSTOM MARKDOWN: ${f.name} =====\n${f.content}`).join("\n\n");
  return [s.customContext.trim(), files].filter(Boolean).join("\n\n");
}

const live = $("#live"), toastEl = $("#toast");
const say = (m) => { live.textContent = m; };
let toastT;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add("on"); say(msg);
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("on"), 2200);
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ── api (same-origin :8001, loopback-only server) ── */
async function api(path, opts = {}, withKey = false) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (withKey) {
    const k = sessionStorage.getItem(KEY);
    if (k) headers["X-API-Key"] = k;
  }
  return fetch(path, { ...opts, headers });
}
async function apiJson(path, opts, withKey, fallback) {
  const r = await api(path, opts, withKey);
  if (!r.ok) {
    let msg = fallback;
    try { const j = await r.json(); if (j?.detail) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); }
    catch { try { msg = await r.text() || fallback; } catch {} }
    throw new Error(msg);
  }
  return r.status === 204 ? null : r.json();
}
async function downloadExport(convId) {
  const r = await api(`/api/conversations/${convId}/export`, { method: "POST" });
  if (!r.ok) throw new Error("Export failed.");
  const blob = await r.blob();
  const m = (r.headers.get("Content-Disposition") || "").match(/filename="?([^";]+)"?/i);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = m?.[1] || "design-critique.html";
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  toast("Downloaded " + a.download);
}

/* ── image prep (2400px, webp .88 — same as React) ── */
function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const s = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * s));
      c.height = Math.max(1, Math.round(img.naturalHeight * s));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const webp = c.toDataURL("image/webp", 0.88);
      const est = Math.ceil((webp.length - webp.indexOf(",") - 1) * 0.75);
      if (!webp.startsWith("data:image/webp") || (s === 1 && est >= file.size)) {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(new Error("Could not read image."));
        fr.readAsDataURL(file);
        return;
      }
      resolve(webp);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image could not be decoded.")); };
    img.src = url;
  });
}

/* ══ HOME: landing → added → analysing (Figma 99:950 → 99:983 → 99:1016) ══ */
function lastMsgs() {
  const msgs = state.conv?.messages || [];
  const rev = [...msgs].reverse();
  return { user: rev.find((m) => m.role === "user"), asst: rev.find((m) => m.role === "assistant") };
}
function fmtPin(p, i) {
  const sev = Number(p.severity ?? 2);
  let cls, sevLabel;
  if (p.category === "strength") { cls = "good"; sevLabel = "Good"; }
  else if (sev >= 4) { cls = "critical"; sevLabel = "Critical"; }
  else if (sev === 3) { cls = "major"; sevLabel = "Major"; }
  else if (sev === 2) { cls = "moderate"; sevLabel = "Moderate"; }
  else { cls = "minor"; sevLabel = "Minor"; }
  return { ...p, i, cls, sevLabel,
    x: p.x ?? p.cxPct ?? 50, y: p.y ?? p.cyPct ?? 50,
    title: p.title || `Annotation ${i + 1}`,
    sub: p.heuristic || p.principle || "", body: p.body || p.comment || "" };
}
function screen() {
  if (state.loading) return "analysing";
  if (state.image || $("#promptInput").value.trim()) return "added";
  return "empty";
}
function renderAll() {
  // home landing only (empty / added); analysing + verdict live in #stacked
  const { user } = lastMsgs();
  const sc = screen();
  const img = state.image || user?.image;

  // image layer: behind the landing columns at 20% once added
  const layer = $("#imageLayer");
  layer.hidden = !img;
  if (img) $("#mainImage").src = img;

  const btn = $("#runBtn");
  btn.classList.toggle("ready", sc === "added");
  btn.disabled = sc !== "added";
  btn.textContent = "Critique my design";
}

/* ── stacked review (Figma 99:1016 analysing / 99:794 verdict) ── */
function firstUser(conv) {
  return (conv?.messages || []).find((m) => m.role === "user") || {};
}
function topicOf(text) {
  const t = String(text || "").toLowerCase();
  for (const [needle, label] of [
    ["onboard", "Onboarding"], ["checkout", "Checkout"], ["pay", "Checkout"],
    ["navig", "Navigation"], ["search", "Search"], ["setting", "Settings"],
    ["error", "Errors"], ["dash", "Dashboard"], ["notif", "Notifications"],
    ["pricing", "Pricing"], ["empty", "Empty state"],
  ]) if (t.includes(needle)) return label;
  return "";
}
function pinCounts(conv) {
  const pins = Array.isArray(lastAsst(conv)?.annotations) ? lastAsst(conv).annotations.map(fmtPin) : [];
  const major = pins.filter((p) => p.cls === "critical" || p.cls === "major").length;
  const moderate = pins.filter((p) => p.cls === "moderate" || p.cls === "minor").length;
  return { major, moderate };
}
function renderStack() {
  // analysing: Title Section + cover image wash + faint bar
  if (state.loading) {
    const stacked = $("#stacked");
    stacked.hidden = false;
    stacked.className = "analysing";
    $("#stTitle").textContent = state.phase || "Analysing image.";
    $("#stCtx").textContent = state.stackCtx || "";
    $("#stAppRow").hidden = true;
    $("#stImg").src = state.stackImg || "";
    $("#stPins").hidden = true;
    closePinCard();
    $("#stFailed").hidden = true;
    const bar = $("#stBar");
    bar.disabled = true;
    bar.classList.remove("ready");
    bar.textContent = "View verdict details";
    return;
  }
  // verdict (ready / failed) from state.stackConv
  const conv = state.stackConv;
  if (!conv) return;
  const user = firstUser(conv);
  const failed = statusOf(conv) === "failed";
  const { major, moderate } = pinCounts(conv);
  const stacked = $("#stacked");
  stacked.hidden = false;
  stacked.className = "verdict";
  $("#stTitle").textContent = conv.title || "Untitled verdict";
  $("#stCtx").textContent = (user.content || "").trim() || "";
  $("#stAppRow").hidden = false;
  $("#stApp").hidden = false;
  $("#stAppInput").hidden = true;
  $("#stApp").textContent = conv.app_name || "Untitled";
  const topic = topicOf(user.content);
  const parts = [];
  if (major) parts.push(`<span class="chip major" data-m="k0">${major} major</span>`);
  if (moderate) parts.push(`<span class="chip moderate" data-m="k1">${moderate} moderate</span>`);
  if (topic) parts.push(`<span class="chip topic" data-m="k2">${esc(topic)}</span>`);
  const box = $("#stChips");
  box.innerHTML = parts.join("");
  box.hidden = !parts.length;
  $("#stImg").src = user.image || "";
  const pins = Array.isArray(lastAsst(conv)?.annotations) ? lastAsst(conv).annotations.map(fmtPin) : [];
  const pinsEl = $("#stPins");
  pinsEl.hidden = !pins.length;
  $("#stPinDots").innerHTML = pins.map((p) =>
    `<button class="pin ${p.cls}" style="left:${p.x}%;top:${p.y}%" data-i="${p.i}" aria-label="${esc(p.title)} — ${esc(p.sevLabel)}"></button>`).join("");
  closePinCard();
  $("#stFailed").hidden = !failed;
  const bar = $("#stBar");
  bar.disabled = false;
  bar.classList.add("ready");
  bar.textContent = failed ? "Run the council again" : "View full verdict";
  requestAnimationFrame(fitPins);
}

/* Map the pins layer onto the contain-fitted image rect (not the container
   box): with object-fit:contain the picture letterboxes, and raw % coords
   would drift into the bars. Re-run on paint, image load and resize. */
function fitPins(){
  const img = $("#stImg"), layer = $("#stPins"), media = $(".st-media");
  if(!img || !layer || !media || layer.hidden) return;
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if(!nw || !nh){ layer.hidden = true; return; }
  const W = media.clientWidth, H = media.clientHeight;
  if(!W || !H) return;
  const s = Math.min(W / nw, H / nh);
  const dw = nw * s, dh = nh * s;
  layer.style.left = ((W - dw) / 2) + "px";
  layer.style.top = ((H - dh) / 2) + "px";
  layer.style.width = dw + "px";
  layer.style.height = dh + "px";
}

/* ── streaming run ── */
// Status line shown in the analysing Title Section (Figma 99:1016).
const PHASES = {
  stage0_start: "Analysing image.",
  stage1_start: "Gathering independent critiques…",
  stage2_start: "Ranking responses…",
  stage3_start: "Synthesising verdict…",
  annotations_start: "Placing annotations…",
};
function onSse(type, ev) {
  if (PHASES[type]) { state.phase = PHASES[type]; if (vxMode === "stack") renderStack(); return; }
  const asst = lastMsgs().asst;
  if (!asst) return;
  if (type === "stage1_complete") asst.stage1 = ev.data;
  else if (type === "stage2_complete") { asst.stage2 = ev.data; if (ev.metadata) asst.metadata = ev.metadata; }
  else if (type === "stage3_complete") asst.stage3 = ev.data;
  else if (type === "annotations_complete") asst.annotations = ev.data;
  else if (type === "title_complete") { state.conv.title = ev.data?.title || state.conv.title; }
  else if (type === "error") { toast(ev.message || "Council error"); return; }
  else if (type === "complete") { if (ev.metadata) asst.metadata = { ...(asst.metadata || {}), ...ev.metadata }; }
  else return;
}
async function streamReview(convId, content, image, settings, onEvent) {
  const r = await api(`/api/conversations/${convId}/message/stream`,
    { method: "POST", body: JSON.stringify({
        content,
        image: image || null,
        custom_context: getReviewContext(settings),
      }) }, true);
  if (!r.ok || !r.body) throw new Error("The server did not return a response stream.");
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const blocks = buf.split(/\r?\n\r?\n/);
    buf = blocks.pop() || "";
    for (const b of blocks) {
      const data = b.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.replace(/^data:\s?/, "")).join("\n");
      if (!data.trim()) continue;
      try { const ev = JSON.parse(data); onEvent(ev.type, ev); } catch (e) { console.error(e); }
    }
  }
}
function showStackAnalysing(content, image) {
  vxMode = "stack";
  $("#main").classList.add("vx");
  $("#vx").hidden = true;
  state.stackImg = image || "";
  state.stackCtx = (content || "").trim() || "Reviewing the attached design.";
  renderStack();
  document.title = "dc. — Analysing";
}
function showStackVerdict(conv, { push = true } = {}) {
  state.stackConv = conv;
  stackReturnList = false;
  vxMode = "stack";
  $("#main").classList.add("vx");
  $("#vx").hidden = true;
  vxView.hidden = true; vxView.replaceChildren();
  renderStack();
  document.title = "dc. — " + (conv.title || "Verdict");
  say("Verdict ready: " + (conv.title || "Untitled"));
  if (push) {
    const next = `?${VXKEY.pv}=${conv.id}&stack=1`;
    if (location.pathname + location.search !== next)
      history.pushState({ view: "stack", id: conv.id }, "", next);
  }
}
// preset re-runs an existing conversation (failed retry); otherwise a fresh
// prompt always starts a fresh conversation, never appends to a finished one
async function runReview(preset = null, { append = false, returnTo = "stack" } = {}) {
  const content = preset?.content ?? $("#promptInput").value;
  const image = preset?.image ?? state.image;
  if ((!content.trim() && !image) || state.loading) return null;
  if (!sessionStorage.getItem(KEY)) { openSettings(); toast("Add your OpenRouter API key first."); return null; }
  const settings = getReviewSettings();
  if (!append && state.conv && lastAsst(state.conv)?.stage3) { state.convId = null; state.conv = null; }
  state.loading = true;
  state.phase = image ? "Analysing image." : "Thinking…";
  showStackAnalysing(content, image);
  let fresh = null;
  try {
    if (!state.convId) {
      const c = await apiJson("/api/conversations", { method: "POST", body: "{}" }, false, "Failed to create conversation");
      state.convId = c.id; state.conv = c;
    }
    const msgs = state.conv.messages || [];
    msgs.push({ role: "user", content, ...(image ? { image } : {}) });
    msgs.push({ role: "assistant", stage1: null, stage2: null, stage3: null, annotations: null, metadata: null, mode: image ? "design" : "text" });
    state.conv.messages = msgs;
    await streamReview(state.convId, content, image, settings, onSse);
    fresh = await apiJson(`/api/conversations/${state.convId}`, { method: "GET" }, false, "");
    state.conv = fresh;
    state.image = null;
    $("#promptInput").value = "";
  } catch (e) {
    toast(e.message || "Failed to send message.");
  } finally {
    state.loading = false;
  }
  if (!fresh) { renderStack(); return null; }
  if (returnTo === "full") {
    state.stackConv = fresh;
    await openFull(fresh.id);
    return fresh;
  }
  autoOpenedId = null;
  showStackVerdict(fresh);
  maybeAutoOpen(fresh.id);
  return fresh;
}
// shared retry path: stacked bar, stacked failed block, and details retry
async function retryCurrent() {
  const conv = state.stackConv;
  if (!conv || state.loading) {
    if (state.loading) toast("Another review is already running. Please try again shortly.");
    return;
  }
  const u = firstUser(conv);
  state.convId = conv.id;
  state.conv = conv;
  const stayFull = vxMode === "full";
  await runReview({ content: u.content || "", image: u.image || null }, { append: true, returnTo: stayFull ? "full" : "stack" });
  if (stayFull && vxMode === "full" && fullRow && fullRow.id === conv.id) {
    try {
      const re = await apiJson(`/api/conversations/${conv.id}`, { method: "GET" }, false, "");
      Object.assign(fullRow, previewOf(re));
    } catch { /* keep what we have */ }
    paintDetails(fullRow, true);
  }
}
function newCritique() {
  state.convId = null; state.conv = null; state.image = null; state.phase = "";
  $("#promptInput").value = "";
  renderAll(); say("New critique started.");
}

/* settings modal (mirrors React SetupModal fields) */
function readSettingsForm() {
  return {
    customContext: $("#setContext").value,
    contextFiles: getReviewSettings().contextFiles,
  };
}
function fillSettingsForm() {
  const s = getReviewSettings();
  const hasKey = Boolean(sessionStorage.getItem(KEY));
  $("#setKey").value = "";
  $("#setKey").placeholder = hasKey ? "••••••••••• (set — leave blank to keep)" : "sk-or-v1-...";
  $("#setContext").value = s.customContext;
  renderSettingsFiles();
  setSettingsError("");
}
function setSettingsError(msg) {
  const el = $("#settingsError");
  el.textContent = msg;
  el.hidden = !msg;
}
function renderSettingsFiles() {
  const files = getReviewSettings().contextFiles;
  $("#setFileList").innerHTML = files.map((f, i) =>
    `<div class="file-row"><span>${esc(f.name)}</span><button type="button" class="link-btn" data-i="${i}" aria-label="Remove ${esc(f.name)}">Remove</button></div>`).join("");
}
function openSettings() {
  fillSettingsForm();
  $("#settingsModal").hidden = false;
  $("#setKey").focus();
  say("Review settings opened.");
}
function closeSettings() {
  $("#settingsModal").hidden = true;
  const active = document.activeElement;
  if (active && $("#settingsModal").contains(active)) $("#settingsBtn").focus();
}
async function setImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  try { state.image = await prepareImage(file); }
  catch (e) { toast(e.message); return; }
  renderAll();
  say("Image added. The critique button is active.");
}

/* ══ FULL VERDICT: preview ⇄ details fold (ported from index.html) ══
   The band list is gone — history opens the latest stacked verdict, and
   "View full verdict" opens this panel. Engine classes live under #vx. */
const VXKEY = {pv:"verdict-preview", de:"verdict-details"};
const E_MORPH="cubic-bezier(.72,0,.16,1)", E_SNAP="cubic-bezier(.16,1,.3,1)", E_OUT="cubic-bezier(.7,0,.2,1)";
const calm = matchMedia("(prefers-reduced-motion:reduce)").matches;
const SLOW = Math.min(20, Math.max(1, +new URLSearchParams(location.search).get("slow") || 1));
const cssVar = (name,fallback) => (parseFloat(getComputedStyle(document.documentElement)
  .getPropertyValue(name)) || fallback) * SLOW;
const SHRINK_IN  = cssVar("--shrink", 460);
const SHRINK_OUT = cssVar("--shrink-out", 280);
if(SLOW > 1){
  document.documentElement.style.setProperty("--shrink", SHRINK_IN + "ms");
  document.documentElement.style.setProperty("--shrink-out", SHRINK_OUT + "ms");
}
const wait = ms => new Promise(r => setTimeout(r, calm ? 0 : ms));

/* ── verdict rows ── */
function lastAsst(conv) {
  return [...(conv?.messages || [])].reverse().find((m) => m.role === "assistant") || null;
}
function statusOf(conv) {
  const asst = lastAsst(conv);
  if (!asst || (!asst.stage1 && !asst.stage2 && !asst.stage3)) return "empty";
  if (asst.stage3 && asst.stage3.model !== "error") return "ready";
  if (asst.stage3) return "failed";
  return "pending";
}
function previewOf(conv) {
  const user = firstUser(conv);
  const { major, moderate } = pinCounts(conv);
  return {
    id: conv.id, name: conv.title || "Untitled verdict",
    ctx: (user.content || "").trim() || "No prompt provided",
    app: conv.app_name || "Untitled",
    img: user.image || "", major, moderate, topic: topicOf(user.content),
    status: statusOf(conv), conv,
  };
}
async function fetchConv(id) {
  return apiJson(`/api/conversations/${id}`, { method: "GET" }, false, "Failed to load conversation");
}
async function updateAppName(convId, name) {
  const clean = String(name || "").trim().slice(0, 120);
  const res = await apiJson(`/api/conversations/${convId}/app-name`,
    { method: "PATCH", body: JSON.stringify({ app_name: clean }) }, false, "Failed to update app name");
  return res?.app_name ?? clean;
}

/* ── markup ── */
const vxChips = v => {
  const out = [];
  if (v.major) out.push(`<span class="chip major">${v.major} major</span>`);
  if (v.moderate) out.push(`<span class="chip moderate">${v.moderate} moderate</span>`);
  if (v.topic) out.push(`<span class="chip topic">${esc(v.topic)}</span>`);
  return out.join("");
};
const vxShot = v => v.img ? `<img src="${v.img}" alt="">` : "";
const vxPanelHTML = v => `
  <aside class="panel">
    <header class="pv-head">
      <p class="name" data-m="name">${esc(v.name)}</p>
      <p class="ctx"  data-m="ctx">${esc(v.ctx)}</p>
      <i class="pv-line"></i>
    </header>
    <section class="pv-app">
      <p class="app" data-m="app">${esc(v.app)}</p>
      <div class="chips">${vxChips(v)}</div>
      <i class="pv-line"></i>
    </section>
    <div class="canvas" data-m="media">${vxShot(v)}<i class="scan"></i></div>
    <div class="ctas">
      <button class="cta ghost" type="button" data-act="hide">Hide verdict details</button>
      <button class="cta ghost" type="button" data-act="council">Council details</button>
      <button class="cta ghost" type="button" data-act="download">Download HTML</button>
    </div>
  </aside>
  <section class="content" id="vxContent"></section>`;
function vxSections(v) {
  const asst = lastAsst(v.conv) || {};
  const s3 = asst.stage3 || {};
  const tmp = document.createElement("div");
  tmp.innerHTML = s3.response_html || esc(s3.response || "");
  // Split the verdict into its authored sections (slugs from markdown h2s).
  // Unknown sections fold into the verdict block so nothing is ever lost.
  const take = (...slugs) => {
    for (const slug of slugs) {
      const el = tmp.querySelector(`:scope > .md-section--${slug}`);
      if (el) {
        const head = el.querySelector(":scope > h1, :scope > h2");
        if (head) head.remove();
        const html = el.innerHTML;
        el.remove();
        return html;
      }
    }
    return "";
  };
  // slugs must match backend section_slug(): any heading containing
  // "verdict" -> md-section--verdict, "issue(s)" -> md-section--issues
  const lead = take("lead");
  const verdict = take("verdict");
  const score = take("scorecard");
  const issues = take("issues");
  const strengths = take("strengths");
  const steps = take("next-steps");
  const rest = tmp.innerHTML;
  const blocks = [
    { cls: "sec soft lead", title: "Council Verdict", html: lead + verdict + rest },
    { cls: "sec", title: "Scorecard", html: score || "<p>No scorecard in this verdict.</p>" },
  ];
  if (issues) blocks.push({ cls: "sec", title: "Top Issues (Prioritized)", html: issues });
  if (strengths) blocks.push({ cls: "sec", title: "Strengths", html: strengths });
  if (steps) blocks.push({ cls: "sec next", title: "Recommended Next Steps", html: steps });
  const s1 = Array.isArray(asst.stage1) ? asst.stage1 : [];
  const s2 = Array.isArray(asst.stage2) ? asst.stage2 : [];
  return { blocks,
    s1: s1.map((s) => `<article><h4>${esc(s.model || "Model")}</h4>${s.response_html || ""}</article>`).join(""),
    s2: s2.map((s) => `<article><h4>${esc(s.model || "Model")}</h4>${s.ranking_html || ""}</article>`).join("") };
}
const vxDetailsHTML = v => {
  if (v.status === "failed") return `
    <div class="sec soft lead" style="--i:0"><h2>Council Verdict</h2>
      <p>This verdict could not be generated. Nothing was lost — the design and its context are still attached, so it can be run again.</p>
      <button class="retry" type="button" data-act="retry">Run the council again</button></div>`;
  const d = vxSections(v);
  const secs = d.blocks.map((b, i) =>
    `<div class="${b.cls}" style="--i:${i}"><h2>${esc(b.title)}</h2>${b.html}</div>`).join("");
  const ci = d.blocks.length;
  return `${secs
  }${d.s1 ? `<details class="sec" data-council style="--i:${ci}"><summary>Stage 1 — independent critiques</summary>${d.s1}</details>` : ""
  }${d.s2 ? `<details class="sec" data-council style="--i:${ci + 1}"><summary>Stage 2 — peer rankings</summary>${d.s2}</details>` : ""}`;
};

/* ── full-verdict state ── */
const vxEl=$("#vx"), vxView=$("#vxView");
let vxState="pv", busy=false, fullRow=null, deep=false;
let foldRun = [], foldGen = 0;

/* (band-list loop removed with the history list) */

/* (band-list input, search and FLIP morph removed with the history list) */

/* preview ⇄ details: the panel folds to a 320px column (WAAPI, interruptible) */
async function fold(toDetails){
  const panel = $(".panel",vxView), c = $(".canvas",vxView);
  const myGen = ++foldGen;
  const from = { w:panel.offsetWidth, h:panel.offsetHeight, c:c.offsetHeight };
  foldRun.forEach(a => a.cancel());
  foldRun = [];
  vxView.classList.add("still");
  vxView.classList.toggle("details",toDetails);
  const to = { w:panel.offsetWidth, h:panel.offsetHeight, c:c.offsetHeight };
  vxView.classList.toggle("details",!toDetails);
  vxView.classList.remove("still");
  if(!toDetails){
    vxView.classList.add("folding");
    await wait(120);
    if(myGen !== foldGen) return;
  }
  vxView.classList.toggle("details",toDetails);
  if(calm){
    vxView.classList.remove("folding");
    if(!toDetails) $("#vxContent",vxView).replaceChildren();
    return;
  }
  c.style.flex = "0 0 auto";
  const opts = {
    duration: toDetails ? SHRINK_IN : SHRINK_OUT,
    easing:   toDetails ? E_MORPH   : E_OUT,
    fill: "both"
  };
  foldRun = [
    panel.animate([{width:from.w+"px",height:from.h+"px"},{width:to.w+"px",height:to.h+"px"}],opts),
    c.animate([{height:from.c+"px"},{height:to.c+"px"}],opts)
  ];
  const mine = foldRun;
  await Promise.all(mine.map(a => a.finished.catch(()=>{})));
  if(myGen !== foldGen) return;
  mine.forEach(a => a.cancel());
  c.style.flex = "";
  vxView.classList.remove("folding");
  if(!toDetails) $("#vxContent",vxView).replaceChildren();
}

/* ── rolling band-list history (ported from index.html) ──
   Scroll physics, settle/blur/opacity curves and the FLIP morph are
   verbatim; colors resolve via tokens.css. A row opens the stacked
   verdict with a shared-element flight (and back again). */
const TAU=.2, PX=150, SNAP=110, WAVE=30, FREQ=.9, VREF=7;
const OP=[1,.7,.5,.3,.1,0], BL=[0,1.1,2.2,3.4,4.6,5.4];
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const damp=(v,goal,tau,dt)=>calm?goal:v+(goal-v)*(1-Math.exp(-dt/tau));
const tbl=(t,x)=>{const n=t.length-1;if(x<=0)return t[0];if(x>=n)return t[n];
  const i=Math.floor(x);return t[i]+(t[i+1]-t[i])*(x-i);};

const vxListEl=$("#vxList"), vxQ=$("#vxQ"),
      vxCount=$("#vxCount"), vxEmpty=$("#vxEmpty");
const vxGrid=document.createElement("div");
vxGrid.className="grid"; vxGrid.ariaHidden="true";
const vxStage=document.createElement("div");
vxStage.className="stage"; vxStage.setAttribute("role","list");
vxListEl.prepend(vxGrid,vxStage);

let feedAll=[], feed=[], cards=[], N=0, MID=0;
let pos=0, target=0, vel=0, tPrev=0, tInput=0, raf=null, stillFrames=0, seated=-1;
let searching=false, stackReturnList=false;
let listReturn={mode:"home"};

// list thumbnails are downsampled in memory (never persisted): a 240px CSS
// box must not pay for decoding a multi-MB data URL on every list open
const thumbCache=new Map();
async function thumbOf(convId,dataUrl,max=480){
  const key=convId+":"+dataUrl.length;
  if(thumbCache.has(key))return thumbCache.get(key);
  const p=(async()=>{
    try{
      if(typeof createImageBitmap!=="function")return dataUrl;
      const blob=await(await fetch(dataUrl)).blob();
      const bmp=await createImageBitmap(blob);
      const s=Math.min(1,max/Math.max(bmp.width,bmp.height));
      if(s>=1){bmp.close();return dataUrl;}
      const c=document.createElement("canvas");
      c.width=Math.max(1,Math.round(bmp.width*s));
      c.height=Math.max(1,Math.round(bmp.height*s));
      c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);
      bmp.close();
      return c.toDataURL("image/jpeg",.85);
    }catch{return dataUrl;}
  })();
  thumbCache.set(key,p);
  return p;
}
async function buildListFeed(){
  const list=await apiJson("/api/conversations",{method:"GET"},false,"Failed to list conversations");
  const ordered=list.filter(c=>(c.message_count??0)>0)
    .sort((a,b)=>(b.created_at||"").localeCompare(a.created_at||""));
  const fetched=await Promise.all(ordered.map((c)=>
    fetchConv(c.id)
      .then((conv)=>{
        const st=statusOf(conv);
        return (st==="ready"||st==="failed")?conv:null;
      })
      .catch(()=>null)));
  const userOf=(conv)=>(conv.messages||[]).find(m=>m.role==="user")||{};
  feedAll=fetched.filter(Boolean).map((conv)=>{
    const user=userOf(conv);
    const {major,moderate}=pinCounts(conv);
    return {i:-1,id:conv.id,name:conv.title||"Untitled verdict",
      ctx:(user.content||"").trim()||"No prompt provided",
      app:conv.app_name||"Untitled",img:user.image||"",thumb:"",
      major,moderate,topic:topicOf(user.content),
      status:statusOf(conv),conv};
  });
  await Promise.all(feedAll.map(async (v)=>{
    v.thumb=v.img?await thumbOf(v.id,v.img):"";
  }));
  feed=feedAll.slice();
}
const vxCardHTML=v=>`
  <article class="card" role="listitem" tabindex="-1" aria-label="${esc(v.name)}. ${esc(v.ctx)} Open verdict.">
    <div class="cell c-title"><div class="stack">
      <p class="name" data-m="name">${esc(v.name)}</p>
      <p class="ctx" data-m="ctx">${esc(v.ctx)}</p>
    </div></div>
    <div class="cell c-media"><div class="mw"><div class="thumb" data-m="media">${(v.thumb||v.img)?`<img src="${v.thumb||v.img}" alt="" loading="lazy" decoding="async">`:""}</div></div></div>
    <div class="cell c-meta"><div class="row">
      <p class="app" data-m="app">${esc(v.app)}</p>
      <div class="chips">${vxRowChips(v)}</div>
    </div></div>
  </article>`;
const vxRowChips=v=>{
  const out=[];
  if(v.major)out.push(`<span class="chip major" data-m="k0">${v.major} major</span>`);
  if(v.moderate)out.push(`<span class="chip moderate" data-m="k1">${v.moderate} moderate</span>`);
  if(v.topic)out.push(`<span class="chip topic" data-m="k2">${esc(v.topic)}</span>`);
  return out.join("");
};
function buildCards(){
  // a leftover grid fade (fill:forwards from an earlier morph) would otherwise
  // keep every band invisible while cards render fine — always reset it here
  vxGrid.getAnimations().forEach(a=>a.cancel());
  vxGrid.style.opacity="";
  vxStage.innerHTML=feed.map(vxCardHTML).join("");
  cards=[...vxStage.children].map((el,i)=>({el,i,
    stack:$(".stack",el),row:$(".row",el),mw:$(".mw",el),x:0,blur:-1}));
  feed.forEach((v,i)=>v.i=i);
  vxEmpty.hidden=feed.length>0;
  measure();
}
function bands(){
  const n=innerWidth<=560?5:innerWidth<=820?7:9;
  if(n===N)return false;
  N=n;MID=(N-1)/2;
  document.documentElement.style.setProperty("--rows",N-1);
  vxGrid.innerHTML=Array.from({length:N},(_,i)=>
    `<div class="band${i===MID?" on":""}"><i></i><i></i><i></i></div>`).join("");
  return true;
}
bands();
let mids=[],half=0;
function measure(){
  mids=[...vxGrid.children].map(b=>b.offsetTop+b.offsetHeight/2);
  half=cards.length?cards[0].el.offsetHeight/2:0;
}
const yAt=s=>{
  const n=mids.length-1;
  if(s<=0)return mids[0]+s*(mids[1]-mids[0]);
  if(s>=n)return mids[n]+(s-n)*(mids[n]-mids[n-1]);
  const i=Math.floor(s);return mids[i]+(mids[i+1]-mids[i])*(s-i);
};
const focused=()=>clamp(Math.round(pos),0,Math.max(0,feed.length-1));
function draw(dt){
  const v=clamp(vel/VREF,-1,1);
  let rest=0;
  for(const c of cards){
    const slot=c.i-pos+MID,d=Math.abs(slot-MID);
    if(d>MID+1){
      if(c.el.style.opacity!=="0")c.el.style.opacity="0";
      continue;
    }
    c.x=damp(c.x,WAVE*v*Math.sin(FREQ*(slot-MID)-pos*.85),.075+.014*d,dt);
    rest=Math.max(rest,Math.abs(c.x));
    const s=c.el.style;
    s.transform=`translate3d(0,${(yAt(slot)-half).toFixed(2)}px,0)`;
    s.opacity=tbl(OP,d).toFixed(3);
    c.stack.style.transform=`translate3d(${c.x.toFixed(2)}px,0,0)`;
    c.row.style.transform=`translate3d(${(-c.x).toFixed(2)}px,0,0)`;
    const grow=d<1?(1-d)*(1-d)*(3-2*(1-d)):0;
    c.mw.style.transform=`scale(${(.8+.2*grow).toFixed(3)})`;
    c.mw.style.opacity=grow.toFixed(3);
    const b=Math.round(tbl(BL,d)*4)/4;
    if(b!==c.blur){s.filter=b>.05?`blur(${b}px)`:"none";c.blur=b;}
    c.el.classList.toggle("hot",d<1.35&&vxMode==="list");
  }
  seat();
  return rest;
}
function seat(){
  const i=focused();
  if(i===seated||!cards[i])return;
  const had=document.activeElement,inList=had&&had.closest&&had.closest(".stage");
  if(cards[seated]){cards[seated].el.tabIndex=-1;cards[seated].el.removeAttribute("aria-current");}
  seated=i;
  cards[i].el.tabIndex=0;
  cards[i].el.setAttribute("aria-current","true");
  if(inList&&vxMode==="list")cards[i].el.focus({preventScroll:true});
}
function frame(now){
  raf=requestAnimationFrame(frame);
  const dt=tPrev?Math.min(.05,(now-tPrev)/1000):.016;tPrev=now;
  if(now-tInput>SNAP)target=Math.round(target);
  const prev=pos;
  pos=damp(pos,target,TAU,dt);
  if(Math.abs(target-pos)<4e-4)pos=target;
  vel=damp(vel,(pos-prev)/dt,.06,dt);
  const rest=draw(dt);
  stillFrames=(pos===target&&Math.abs(vel)<.002&&rest<.02)?stillFrames+1:0;
  if(stillFrames>2)sleep();
}
const wake=()=>{if(!raf){tPrev=0;raf=requestAnimationFrame(frame);}};
const sleep=()=>{if(raf)cancelAnimationFrame(raf);raf=null;tPrev=0;stillFrames=0;};
const push=d=>{tInput=performance.now();target=clamp(target+d,0,Math.max(0,feed.length-1));wake();};
const step=n=>push(Math.round(target)-target+n);

addEventListener("wheel",e=>{
  if(vxMode!=="list")return;
  e.preventDefault();
  push(e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1)/PX);
},{passive:false});
let ty=null,tt=0,tv=0;
addEventListener("touchstart",e=>{if(vxMode==="list"){ty=e.touches[0].clientY;tt=performance.now();tv=0;}},{passive:true});
addEventListener("touchmove",e=>{
  if(vxMode!=="list"||ty===null||e.touches.length>1)return;
  e.preventDefault();
  const y=e.touches[0].clientY,now=performance.now(),dy=(ty-y)/110;
  tv=dy/(Math.max(8,now-tt)/1000);ty=y;tt=now;push(dy);
},{passive:false});
addEventListener("touchend",()=>{if(ty!==null&&Math.abs(tv)>1.2)push(tv*.28);ty=null;},{passive:true});
vxStage.addEventListener("click",e=>{
  const el=e.target.closest(".card");
  if(!el||busy||vxMode!=="list")return;
  const i=cards.findIndex(c=>c.el===el);
  Math.abs(i-pos)<.2?(pos=target=i,openStackedFromList(feed[i])):push(i-target);
});
function toggleSearch(on){
  searching=on??!searching;
  vxListEl.classList.toggle("searching",searching);
  if(searching){vxQ.focus();}
  else{vxQ.value="";applyFilter();vxQ.blur();if(cards[focused()])cards[focused()].el.focus({preventScroll:true});}
}
function applyFilter(){
  const q=vxQ.value.trim().toLowerCase();
  feed=q?feedAll.filter(v=>(v.name+" "+v.ctx+" "+v.app+" "+(v.topic||"")).toLowerCase().includes(q)):feedAll.slice();
  seated=-1;
  buildCards();
  pos=target=0;vel=0;
  vxCount.textContent=q?`${feed.length}/${feedAll.length}`:"";
  vxEmpty.textContent=q&&!feed.length?`No verdicts match “${vxQ.value.trim()}”`:"";
  say(q?`${feed.length} of ${feedAll.length} verdicts match`:`${feedAll.length} verdicts`);
  tInput=performance.now();wake();
}
vxQ.addEventListener("input",applyFilter);

/* shared-element morph between a band card and the stacked verdict */
const ghosts=Object.assign(document.createElement("div"),{className:"ghosts"});
document.body.append(ghosts);
const marks=root=>Object.fromEntries([...root.querySelectorAll("[data-m]")]
  .map(el=>[el.dataset.m,{el,r:el.getBoundingClientRect()}]));
const veil=(m,on)=>Object.values(m).forEach(({el})=>
  el.classList.contains("canvas")?el.classList.toggle("ghosting",!on):el.style.opacity=on?"":"0");
const fly=(from,to,scale,ms,delay,ease=E_MORPH)=>{
  const g=from.el.cloneNode(true);
  g.classList.remove("ghosting");
  g.style.cssText=`position:fixed;left:0;top:0;margin:0;transform-origin:0 0;overflow:hidden;
    width:${from.r.width}px;height:${from.r.height}px`;
  ghosts.append(g);
  const box=scale?[{},{}]
    :[{width:from.r.width+"px",height:from.r.height+"px"},{width:to.r.width+"px",height:to.r.height+"px"}];
  return g.animate([
    {...box[0],transform:`translate3d(${from.r.left}px,${from.r.top}px,0) scale(1,1)`},
    {...box[1],transform:`translate3d(${to.r.left}px,${to.r.top}px,0) scale(${scale?to.r.width/from.r.width:1},${scale?to.r.height/from.r.height:1})`}
  ],{duration:ms,delay,easing:ease,fill:"both"});
};
let scat=[];
function evacuate(out,now){
  scat.forEach(a=>a.cancel());scat=[];
  const f=focused();
  const moves=cards.filter(c=>c.i!==f).map(c=>{
    const gap=Math.abs(c.i-f),d=Math.min(4,gap),dir=c.i>f?1:-1;
    const y=yAt(c.i-pos+MID)-half;
    const seatK={transform:`translate3d(0,${y}px,0) scale(1)`,opacity:tbl(OP,gap)};
    const gone={transform:`translate3d(0,${y+dir*(150+60*d)}px,0) scale(.97)`,opacity:0};
    if(now){const s=out?gone:seatK;c.el.style.transform=s.transform;c.el.style.opacity=s.opacity;return null;}
    const a=c.el.animate(out?[seatK,gone]:[gone,seatK],
      {duration:out?400:440,delay:d*18,easing:out?E_OUT:E_SNAP,fill:"both"});
    scat.push(a);return a;
  }).filter(Boolean);
  if(now){vxGrid.style.opacity=out?0:"";return[];}
  return moves.concat(vxGrid.animate([{opacity:out?1:0},{opacity:out?0:1}],{duration:260,fill:"both"}));
}
const MORPH_KEYS=[["media",20,true],["name",60],["ctx",90],["app",130],["k0",170],["k1",196],["k2",222]];
const flightPairs=(card,panel)=>MORPH_KEYS
  .filter(([k])=>card[k]&&panel[k]&&card[k].r.width&&panel[k].r.width);
async function morphToStacked(row){
  const card=marks(cards[row.i].el),panel=marks($("#stacked"));
  veil(card,false);veil(panel,false);
  if(!calm)await Promise.all([
    ...flightPairs(card,panel)
      .map(([k,d,isBox])=>fly(card[k],panel[k],!!isBox,isBox?560:480,d,isBox?E_MORPH:E_SNAP)),
    ...evacuate(1)
  ].map(a=>a.finished.catch(()=>{})));
  else evacuate(1,true);
  veil(panel,true);
  ghosts.replaceChildren();
  vxEl.hidden=true;
  vxMode="stack";
  document.title="dc. — "+row.name;
}
async function morphBackToList(){
  if(busy)return;busy=true;
  try{
    await buildListFeed();
    const idx=state.stackConv?feed.findIndex(v=>v.id===state.stackConv.id):-1;
    buildCards();
    pos=target=Math.max(0,idx);draw(0);
    vxEl.hidden=false;
    vxListEl.hidden=false;
    const row=feed[Math.max(0,idx)]||feed[0];
    if(!row){exitListToHome();return;}
    const card=marks(cards[row.i].el),panel=marks($("#stacked"));
    veil(card,false);veil(panel,false);
    if(!calm)await Promise.all([
      ...flightPairs(panel,card)
        .map(([k,d,isBox])=>fly(panel[k],card[k],!!isBox,440,d*.7,E_SNAP)),
      ...evacuate(0)
    ].map(a=>a.finished.catch(()=>{})));
    else evacuate(0,true);
    $("#stacked").hidden=true;
    veil(card,true);
    ghosts.replaceChildren();
    vxGrid.getAnimations().forEach(a=>a.cancel());
    vxGrid.style.opacity="";cards.forEach(c=>{c.el.style.opacity="";c.blur=-1;});
    vxMode="list";vxState="list";
    tInput=performance.now();wake();
    history.replaceState({view:"list"},"",location.pathname);
    say("All verdicts");
  }finally{busy=false;}
}
async function openStackedFromList(row){
  if(!row||busy)return;
  busy=true;
  try{
    const conv=await fetchConv(row.id);
    // lay out the stacked target FIRST (still covered by the opaque #vx
    // overlay): morph measures live rects, and hidden subtrees read as zero
    state.stackConv=conv;
    stackReturnList=true;
    renderStack();
    $("#stacked").hidden=false;
    vxMode="stack";
    await morphToStacked(row);
    maybeAutoOpen(conv.id);
    vxView.hidden=true;vxView.replaceChildren();
    history.pushState({view:"stack",id:conv.id},"",`?${VXKEY.pv}=${conv.id}&stack=1`);
    say("Verdict: "+(conv.title||"Untitled"));
  }catch(e){toast(e.message||"Failed to open verdict.");}
  busy=false;
}
function stopList(){
  sleep();
  searching=false;
  if(vxQ)vxQ.value="";
}
function exitListToHome(){
  stopList();
  enterHome({push:false});
  history.pushState({view:"home"},"",location.pathname);
}
async function enterList({push=true}={}){
  listReturn={mode:vxMode};
  vxMode="list";
  $("#main").classList.add("vx");
  $("#vx").hidden=false;
  vxListEl.hidden=false;
  vxView.hidden=true;vxView.replaceChildren();
  try{await buildListFeed();}
  catch(e){toast(e.message||"Failed to load history.");feedAll=[];feed=[];}
  seated=-1;
  buildCards();
  vxQ.value="";vxCount.textContent="";
  vxEmpty.textContent=feedAll.length?"":"No verdicts yet — run your first review.";
  pos=target=0;vel=0;
  vxState="list";
  document.title="dc. — Verdicts";
  if(push)history.pushState({view:"list"},"",location.pathname);
  wake();
  say(feedAll.length?`${feedAll.length} verdicts. Arrows to move, Enter to open, slash to search.`:"No verdicts yet.");
}
addEventListener("resize",()=>{if(vxMode!=="list")return;bands();measure();wake();});
document.addEventListener("visibilitychange",()=>{if(vxMode!=="list")return;document.hidden?sleep():wake();});

/* rail: plus starts fresh at home, history toggles the band list */
$("#plusBtn").addEventListener("click", () => {
  if (vxMode !== "home") enterHome({ push: false });
  newCritique();
  $("#promptInput").focus();
});
$("#historyBtn").addEventListener("click", () => {
  if (vxMode === "list") exitListToHome();
  else enterList();
});

/* router: home ⇄ stack ⇄ full(details), URL follows, document never reloads */
const vxUrl = (s,id) => `?${VXKEY[s]}=${id}`;
function vxRender(v,mode){
  vxView.innerHTML = vxPanelHTML(v);
  vxView.className = "view" + (mode==="deep" ? " deep" : "");
  vxView.hidden = false;
  // no pins here by design: the stacked verdict is the annotation surface;
  // the full-verdict panel keeps a clean thumbnail
  document.title = "dc. — " + v.name;
}
// back out of the full verdict to the stacked view (deep links have no
// history beneath them, so they fold out manually instead)
const vxBack = () => {
  if(deep){ deep = false; showStackVerdict(state.stackConv, {push:false}); }
  else history.back();
};
function enterHome({push=true}={}){
  stopList();
  stackReturnList = false;
  vxMode = "home";
  vxEl.hidden = true;
  $("#stacked").hidden = true;
  $("#main").classList.remove("vx");
  document.title = "dc. — Design Critique";
  renderAll();
  say("Back to a new critique. Your verdicts are under the history icon.");
  if(push && location.pathname + location.search !== location.pathname)
    history.pushState({view:"home"},"",location.pathname);
}
// open the full verdict for a finished conversation.
// details+animate: one continuous gesture — the panel lands, then folds
// straight into the details pane, with no static preview stop in between.
// (Boot deep-links keep the instant path via animate:false.)
// open the full verdict: the panel lands, then folds straight into the
// details pane — there is no static preview stop. instant=true only for
// boot/popstate restores, which must not dance on arrival.
async function openFull(convId, { push = true, replace = false, instant = false } = {}) {
  let conv = state.stackConv && state.stackConv.id === convId ? state.stackConv : null;
  if (!conv) {
    try { conv = await fetchConv(convId); }
    catch (e) { toast(e.message || "Failed to load verdict."); return; }
    state.stackConv = conv;
  }
  fullRow = previewOf(conv);
  vxMode = "full";
  $("#main").classList.add("vx");
  $("#vx").hidden = false;
  // the band list stays mounted underneath — hide it so its cards can never
  // bleed through the transparent verdict view
  vxListEl.hidden = true;
  const next = vxUrl("de", convId);
  if (instant) {
    vxRender(fullRow, "deep");
    vxState = "pv";
    $("#vxContent", vxView).innerHTML = vxDetailsHTML(fullRow);
    vxView.classList.add("details");
    vxState = "de";
    say("Verdict details: " + fullRow.name);
  } else {
    if (busy) return;
    busy = true;
    try {
      vxRender(fullRow);
      vxState = "pv";
      $("#vxContent", vxView).innerHTML = vxDetailsHTML(fullRow);
      vxState = "de";
      say("Verdict details: " + fullRow.name);
      await fold(true);
    } finally { busy = false; }
  }
  if (push && location.pathname + location.search !== next)
    history[replace ? "replaceState" : "pushState"]({ view: "full", s: "de", id: convId }, "", next);
}
function paintDetails(v, flash=false){
  const box = $("#vxContent", vxView);
  if(!box) return;
  if(flash) box.classList.add("now");
  box.innerHTML = vxDetailsHTML(v);
  if(flash) setTimeout(()=>box.classList.remove("now"), 1200);
}

/* full-verdict CTAs (delegated) */
vxView.addEventListener("click", async (e) => {
  const act = e.target.closest("[data-act]")?.dataset.act;
  if(!act || busy || !fullRow) return;
  const v = fullRow;
  if(act === "hide") {
    // reverse fold first (content bows out, panel unfolds), then navigate —
    // mirrors openFull's fold-in instead of an instant jump
    if (vxState === "de") {
      busy = true;
      try { await fold(false); } finally { busy = false; }
    }
    vxBack();
    return;
  }
  else if(act === "back") vxBack();
  else if(act === "council"){
    const secs = [...vxView.querySelectorAll("#vxContent details[data-council]")];
    if(!secs.length){ toast("No council details in this verdict."); return; }
    const open = secs.some((d) => !d.open);
    secs.forEach((d) => { d.open = open; });
    if(open) secs[0].scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "nearest" });
    say(open ? "Council details shown." : "Council details hidden.");
  }
  else if(act === "download"){ try { await downloadExport(v.id); } catch(err){ toast(err.message); } }
  else if(act === "retry") retryCurrent();
});

/* ── annotation pin card (preview overlay) ── */
let activePin = null;
let autoOpenedId = null;
function maybeAutoOpen(id) {
  if (activePin !== null || autoOpenedId === id) return;
  if (!stackPins().length) return;
  autoOpenedId = id;
  openPinCard(0);
}
function stackPins() {
  const conv = state.stackConv;
  if (!conv) return [];
  const anns = lastAsst(conv)?.annotations;
  return Array.isArray(anns) ? anns.map(fmtPin) : [];
}
function openPinCard(i) {
  const pins = stackPins();
  if (!pins.length) return;
  activePin = Math.max(0, Math.min(pins.length - 1, i));
  paintPinCard(pins);
  say(`Annotation ${activePin + 1} of ${pins.length}: ${pins[activePin].title}`);
}
function closePinCard() {
  activePin = null;
  const card = $("#pinCard");
  if (card) card.hidden = true;
}
function stepPinCard(delta) {
  if (activePin === null) return;
  const pins = stackPins();
  const next = activePin + delta;
  if (next < 0 || next >= pins.length) return;
  activePin = next;
  paintPinCard(pins, true);
}
function paintPinCard(pins, swapping = false) {
  const card = $("#pinCard");
  const p = pins[activePin];
  if (!card || !p) return;
  card.innerHTML = `
    <div class="pin-card-top">
      <span class="pin-card-index">${activePin + 1}</span>
      <span class="pin-card-sev ${p.cls}">${esc(p.sevLabel)}</span>
      <button class="pin-card-x" type="button" data-card="close" aria-label="Close annotation">✕</button>
    </div>
    <div class="pin-card-body${swapping ? " swap" : ""}">
      <p class="pin-card-title">${esc(p.title)}</p>
      ${p.sub ? `<p class="pin-card-principle">${esc(p.sub)}</p>` : ""}
      ${p.body ? `<p class="pin-card-text">${esc(p.body)}</p>` : ""}
    </div>
    <div class="pin-card-nav">
      <button type="button" data-card="prev" aria-label="Previous annotation" ${activePin === 0 ? "disabled" : ""}>‹</button>
      <button type="button" data-card="next" aria-label="Next annotation" ${activePin === pins.length - 1 ? "disabled" : ""}>›</button>
    </div>`;
  // anchor from the pin button's live rect (already mapped onto the fitted
  // image box) instead of raw % coords, so letterboxing can't drift the card
  const media = $(".st-media");
  const btn = $("#stPins")?.querySelector(`.pin[data-i="${activePin}"]`);
  if (media && btn) {
    const mr = media.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const cx = br.left - mr.left + br.width / 2, cy = br.top - mr.top + br.height / 2;
    card.style.top = Math.min(Math.max(cy, 70), Math.max(70, mr.height - 70)) + "px";
    card.style.left = cx + "px";
    card.classList.toggle("flip", cx > mr.width * 0.55);
  } else {
    card.style.top = `clamp(70px, ${p.y}%, calc(100% - 70px))`;
    card.style.left = `${p.x}%`;
    card.classList.toggle("flip", p.x > 55);
  }
  card.hidden = false;
  if (swapping) requestAnimationFrame(() => requestAnimationFrame(
    () => card.querySelector(".pin-card-body")?.classList.remove("swap")));
}

/* stacked verdict wiring: bar, pins, card, app-name edit */
$("#stBar").addEventListener("click", () => {
  if (vxMode !== "stack" || !state.stackConv) return;
  closePinCard();
  if (statusOf(state.stackConv) === "failed") retryCurrent();
  else openFull(state.stackConv.id);
});
$("#stPins").addEventListener("click", (e) => {
  const b = e.target.closest(".pin");
  if (!b || !state.stackConv) return;
  openPinCard(Number(b.dataset.i));
});
$("#pinCard").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-card]");
  if (!btn) return;
  const act = btn.dataset.card;
  if (act === "close") closePinCard();
  else if (act === "prev") stepPinCard(-1);
  else if (act === "next") stepPinCard(1);
});
$("#stApp").addEventListener("click", () => {
  if (!state.stackConv) return;
  $("#stApp").hidden = true;
  const input = $("#stAppInput");
  input.hidden = false;
  input.value = state.stackConv.app_name || "";
  input.focus();
  input.select();
});
async function commitAppName(save) {
  const input = $("#stAppInput");
  input.hidden = true;
  $("#stApp").hidden = false;
  if (!save || !state.stackConv) { renderStack(); return; }
  const before = state.stackConv.app_name || "";
  if (input.value.trim() === before) return;
  try {
    const next = await updateAppName(state.stackConv.id, input.value);
    state.stackConv.app_name = next;
    if (fullRow && fullRow.id === state.stackConv.id) fullRow.app = next || "Untitled";
    renderStack();
    say("App name saved.");
  } catch (e) { toast(e.message); renderStack(); }
}
$("#stAppInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); commitAppName(true); }
  else if (e.key === "Escape") { e.preventDefault(); commitAppName(false); }
});
$("#stAppInput").addEventListener("blur", () => commitAppName(true));

/* merged keyboard: settings > full verdict > list > stacked > home */
document.addEventListener("keydown", (e) => {
  if(!$("#settingsModal").hidden){
    if(e.key === "Escape") closeSettings();
    return;
  }
  if(vxMode === "full"){
    if(e.key === "Escape") vxBack();
    return;
  }
  if(vxMode === "list"){
    if(searching){
      if(e.key==="Escape"){ e.preventDefault(); toggleSearch(false); }
      else if(e.key==="Enter" && feed.length){ e.preventDefault(); openStackedFromList(feed[focused()]); }
      else if(e.key==="ArrowDown"){ e.preventDefault(); step(1); }
      else if(e.key==="ArrowUp"){ e.preventDefault(); step(-1); }
      return;
    }
    const k = e.key;
    if(k==="/"){ toggleSearch(true); }
    else if(k==="ArrowDown"||k==="j"||k===" ") step(1);
    else if(k==="ArrowUp"||k==="k") step(-1);
    else if(k==="PageDown") step(4); else if(k==="PageUp") step(-4);
    else if(k==="Home") push(-target); else if(k==="End") push(feed.length-target);
    else if(k==="Enter" && feed.length) openStackedFromList(feed[focused()]);
    else if(k==="Escape") exitListToHome();
    else return;
    e.preventDefault();
    return;
  }
  if(vxMode === "stack"){
    if(activePin !== null){
      if(e.key === "Escape"){ e.preventDefault(); closePinCard(); }
      else if(e.key === "ArrowLeft"){ e.preventDefault(); stepPinCard(-1); }
      else if(e.key === "ArrowRight"){ e.preventDefault(); stepPinCard(1); }
      else return;
      return;
    }
    if(e.key === "Escape"){
      if(stackReturnList){ stackReturnList=false; morphBackToList(); }
      else enterHome();
    }
    return;
  }
  if(e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || "")) {
    e.preventDefault(); $("#promptInput").focus();
  }
});
addEventListener("popstate", async (e) => {
  const s = e.state || {view:"home"};
  if(s.view === "list"){ enterList({push:false}); return; }
  if(s.view === "full" && s.id){
    if (vxMode === "stack" && state.stackConv && state.stackConv.id === s.id) {
      await openFull(s.id, { push: false, instant: true });
    } else {
      try {
        const conv = await fetchConv(s.id);
        state.stackConv = conv;
        await openFull(s.id, { push: false, instant: true });
      } catch (err) { toast(err.message); enterHome({ push: false }); }
    }
    return;
  }
  if(s.view === "stack" && s.id){
    try {
      const conv = await fetchConv(s.id);
      showStackVerdict(conv, { push: false });
    } catch (err) { toast(err.message); enterHome({ push: false }); }
    return;
  }
  if(vxMode!=="home") enterHome({push:false});
});

/* ── home wiring ── */
$("#runBtn").addEventListener("click", runReview);
$("#promptInput").addEventListener("input", renderAll);
$("#promptInput").addEventListener("keydown", (e) => {
  if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); runReview(); }
});
$("#uploadBtn").addEventListener("click", () => $("#fileInput").click());
$("#fileInput").addEventListener("change", (e) => setImage(e.target.files?.[0]));
["dragover", "dragenter"].forEach((ev) => document.addEventListener(ev, (e) => {
  if(e.dataTransfer?.types?.includes("Files")) e.preventDefault();
}));
document.addEventListener("drop", (e) => {
  e.preventDefault();
  if(vxMode!=="home") return;
  const f = e.dataTransfer?.files?.[0];
  if(f) setImage(f);
});
document.addEventListener("paste", (e) => {
  if(vxMode!=="home") return;
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if(item) setImage(item.getAsFile());
});
$("#settingsBtn").addEventListener("click", openSettings);
$("#settingsClose").addEventListener("click", closeSettings);
$("#setCancel").addEventListener("click", closeSettings);
$("#settingsModal").addEventListener("click", (e) => {
  if(e.target === $("#settingsModal")) closeSettings();
});
$("#setKeyToggle").addEventListener("click", () => {
  const input = $("#setKey");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  $("#setKeyToggle").textContent = show ? "Hide" : "Show";
});
$("#setMdFiles").addEventListener("change", async (e) => {
  const files = [...(e.target.files || [])].filter((f) => f.name.toLowerCase().endsWith(".md")).slice(0, 8);
  const imported = await Promise.all(files.map(async (f) => ({ name: f.name, content: await f.text() })));
  const s = getReviewSettings();
  saveReviewSettings({ ...s, contextFiles: [...s.contextFiles, ...imported].slice(-8) });
  renderSettingsFiles();
  e.target.value = "";
});
$("#setFileList").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-i]");
  if (!btn) return;
  const s = getReviewSettings();
  saveReviewSettings({ ...s, contextFiles: s.contextFiles.filter((_, i) => i !== +btn.dataset.i) });
  renderSettingsFiles();
});
$("#setSave").addEventListener("click", () => {
  const typed = $("#setKey").value.trim();
  const hasKey = Boolean(sessionStorage.getItem(KEY));
  if (!typed && !hasKey) {
    setSettingsError("An OpenRouter API key is required to run the council.");
    return;
  }
  if (typed) sessionStorage.setItem(KEY, typed);
  saveReviewSettings(readSettingsForm());
  setSettingsError("");
  closeSettings();
  toast("Settings saved.");
});
$("#setClear").addEventListener("click", () => {
  sessionStorage.removeItem(KEY);
  fillSettingsForm();
  toast("API key cleared.");
});

/* boot */
(async () => {
  // natural size isn't ready on first paint — refit once it arrives
  $("#stImg").addEventListener("load", () => fitPins());
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => fitPins()).observe($(".st-media"));
  } else {
    addEventListener("resize", () => fitPins());
  }
  renderAll();
  const q = new URLSearchParams(location.search);
  const id = q.get(VXKEY.de) || q.get(VXKEY.pv);
  if (id && q.get("stack") === "1") {
    try {
      const conv = await fetchConv(id);
      history.replaceState({ view: "stack", id }, "", location.href);
      showStackVerdict(conv, { push: false });
    } catch (e) {
      toast(e.message || "Could not open that verdict.");
      history.replaceState({ view: "home" }, "", location.pathname);
    }
  } else if (id) {
    try {
      const conv = await fetchConv(id);
      state.stackConv = conv;
      deep = true;
      if (q.has(VXKEY.de)) {
        history.replaceState({ view: "full", s: "de", id }, "", location.href);
        await openFull(id, { push: false, instant: true });
      } else {
        history.replaceState({ view: "stack", id }, "", `?${VXKEY.pv}=${id}&stack=1`);
        showStackVerdict(conv, { push: false });
      }
    } catch (e) {
      toast(e.message || "Could not open that verdict.");
      history.replaceState({ view: "home" }, "", location.pathname);
    }
  } else {
    history.replaceState({view:"home"},"",location.href);
    say("Ready. Type a prompt or add an image — the button activates when there is something to critique.");
  }
})();
})();
