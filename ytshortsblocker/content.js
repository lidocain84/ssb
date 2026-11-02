(() => {
  const DEFAULTS = { enabled: true, blocked: [], skipped: 0 };
  const LOG = "[Shorts Sound Blocker]";
  // Sound chip text usually looks like "Song name · Artist" or "Original sound - name"
  const NAME_RE = /·|^(original (sound|audio)|eredeti hang)/i;
  const SELECTORS = [
    'a[href*="/source/"]',
    "yt-reel-sound-metadata-view-model",
    '[class*="SoundMetadata" i]',
    '[class*="sound-metadata" i]',
    '[class*="reel-sound" i]'
  ];

  let state = { ...DEFAULTS };
  let lastKey = null;
  let lastSkipAt = 0;
  let current = null;
  let btn = null;
  let toastEl = null;
  let toastTimer = null;
  let lastWarn = 0;
  let lastHeuristicAt = 0;
  let heuristicCache = null;

  chrome.storage.local.get(DEFAULTS).then((s) => { state = { ...DEFAULTS, ...s }; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const k in changes) state[k] = changes[k].newValue;
    lastKey = null; // re-evaluate after the list changes
  });

  const isShorts = () => location.pathname.startsWith("/shorts");
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const norm = (s) => clean(s).replace(/[\u2018\u2019]/g, "'").toLowerCase();

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top >= -10 && r.top < window.innerHeight;
  }

  function build(el, text) {
    const link = el.closest('a[href*="/source/"]') || el.querySelector('a[href*="/source/"]');
    const m = link && (link.getAttribute("href") || "").match(/\/source\/([^/?#]+)/);
    return { id: m ? m[1] : "t:" + norm(text), name: text, el };
  }

  // Strategy 1: known selectors for the sound chip
  function findBySelectors() {
    for (const sel of SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.closest("#shf-btn, #shf-toast") || !isVisible(el)) continue;
        const text = clean(el.textContent);
        if (text && text.length < 160) return build(el, text);
      }
    }
    return null;
  }

  // Strategy 2: find the smallest visible element whose text looks like a sound label
  function findByText() {
    const now = Date.now();
    if (now - lastHeuristicAt < 1000) {
      return heuristicCache && heuristicCache.el.isConnected && isVisible(heuristicCache.el) ? heuristicCache : null;
    }
    lastHeuristicAt = now;
    const root =
      document.querySelector("ytd-reel-video-renderer[is-active]") ||
      document.querySelector("ytd-shorts") ||
      document.body;
    let best = null;
    let bestArea = Infinity;
    for (const el of root.querySelectorAll("span, a, button, div, yt-formatted-string")) {
      if (el.childElementCount > 6 || el.closest("#shf-btn, #shf-toast") || !isVisible(el)) continue;
      const t = clean(el.textContent);
      if (t.length < 4 || t.length > 120 || !NAME_RE.test(t)) continue;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area < bestArea) { best = { el, t }; bestArea = area; }
    }
    heuristicCache = best ? build(best.el, best.t) : null;
    return heuristicCache;
  }

  const getSound = () => findBySelectors() || findByText();

  // An entry blocks a sound if the ids match, or (for name entries) the name contains the text
  const matches = (entry, sound) =>
    entry.id === sound.id ||
    (entry.id.startsWith("t:") && norm(sound.name).includes(entry.id.slice(2)));
  const findEntry = (sound) => state.blocked.find((e) => matches(e, sound));

  function skip() {
    const b = document.querySelector("#navigation-button-down button") ||
              document.querySelector("#navigation-button-down");
    if (b) { b.click(); return; }
    const ev = { key: "ArrowDown", code: "ArrowDown", keyCode: 40, which: 40, bubbles: true };
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent("keydown", ev));
  }

  function toast(text) {
    if (!toastEl || !document.body.contains(toastEl)) {
      toastEl = document.createElement("div");
      toastEl.id = "shf-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add("shf-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("shf-show"), 2200);
  }

  function ensureButton() {
    if (btn && document.body.contains(btn)) return;
    btn = document.createElement("button");
    btn.id = "shf-btn";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!current) { toast("Couldn't detect the sound of this Short."); return; }
      const entry = findEntry(current);
      if (entry) {
        const sound = current;
        state.blocked = state.blocked.filter((b) => !matches(b, sound));
        chrome.storage.local.set({ blocked: state.blocked });
        toast("Unblocked: " + current.name);
      } else {
        state.blocked = [...state.blocked, { id: current.id, name: current.name }];
        chrome.storage.local.set({ blocked: state.blocked });
        toast("Blocked: " + current.name);
        lastKey = location.pathname + current.id;
        setTimeout(skip, 250);
      }
    });
    document.body.appendChild(btn);
  }

  function updateButton() {
    if (!btn) return;
    // No sound detected (e.g. a Short with only a "source video" chip): nothing to block, hide the button
    if (!current) { btn.style.display = "none"; return; }
    btn.style.display = "block";
    if (findEntry(current)) {
      btn.textContent = "✓ Blocked – undo";
      btn.classList.add("shf-blocked");
    } else {
      btn.textContent = "🚫 Block this sound";
      btn.classList.remove("shf-blocked");
    }
  }

  // Keep the button directly under the sound chip (or next to it if there's no room below)
  function place() {
    if (btn) {
      if (!isShorts()) {
        btn.style.display = "none";
      } else {
        const el = current && current.el;
        const r = el && el.isConnected ? el.getBoundingClientRect() : null;
        if (r && r.width > 0) {
          let left = r.left;
          let top = r.bottom + 6;
          if (top + 28 > window.innerHeight) {
            left = r.right + 8;
            top = r.top + (r.height - 24) / 2;
          }
          btn.style.left = left + "px";
          btn.style.top = top + "px";
          btn.style.bottom = "auto";
        }
      }
    }
    requestAnimationFrame(place);
  }

  function tick() {
    if (!isShorts()) return;
    ensureButton();
    current = getSound();
    updateButton();
    if (!current) {
      if (Date.now() - lastWarn > 5000) {
        lastWarn = Date.now();
        console.debug(LOG, "sound chip not found for", location.pathname);
      }
      return;
    }
    if (!state.enabled) return;

    const key = location.pathname + current.id;
    if (key === lastKey) return;
    lastKey = key;

    if (findEntry(current) && Date.now() - lastSkipAt > 400) {
      lastSkipAt = Date.now();
      toast("Skipped: " + current.name);
      chrome.storage.local.set({ skipped: (state.skipped || 0) + 1 });
      skip();
    }
  }

  setInterval(tick, 400);
  requestAnimationFrame(place);
})();
