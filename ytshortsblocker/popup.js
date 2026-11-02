const DEFAULTS = { enabled: true, blocked: [], skipped: 0 };
const $ = (id) => document.getElementById(id);
const norm = (s) => s.replace(/\s+/g, " ").replace(/[\u2018\u2019]/g, "'").trim().toLowerCase();

async function load() {
  const s = await chrome.storage.local.get(DEFAULTS);
  $("enabled").checked = s.enabled;
  $("count").textContent = "Skipped so far: " + s.skipped + " Shorts";
  const list = $("list");
  list.textContent = "";
  if (!s.blocked.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "The blocklist is empty. Use the “Block this sound” button while watching Shorts.";
    list.appendChild(li);
  }
  for (const b of s.blocked) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = b.name;
    const small = document.createElement("small");
    small.textContent = b.id.startsWith("t:") ? "matches by name" : b.id;
    span.appendChild(small);
    const del = document.createElement("button");
    del.textContent = "Remove";
    del.addEventListener("click", async () => {
      const cur = await chrome.storage.local.get(DEFAULTS);
      await chrome.storage.local.set({ blocked: cur.blocked.filter((x) => x.id !== b.id) });
      load();
    });
    li.append(span, del);
    list.appendChild(li);
  }
}

$("enabled").addEventListener("change", (e) => chrome.storage.local.set({ enabled: e.target.checked }));

$("add").addEventListener("click", async () => {
  const raw = $("entry").value.trim();
  if (!raw) return;
  const m = raw.match(/\/source\/([^/?#]+)/);
  const entry = m ? { id: m[1], name: m[1] } : { id: "t:" + norm(raw), name: raw };
  const cur = await chrome.storage.local.get(DEFAULTS);
  if (!cur.blocked.some((x) => x.id === entry.id)) {
    await chrome.storage.local.set({ blocked: [...cur.blocked, entry] });
  }
  $("entry").value = "";
  load();
});

load();
