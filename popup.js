const KEY = "heft.notes.v1";

const WELCOME = [
  "# Willkommen bei Heft",
  "",
  "Notizen bleiben in diesem Browser. Die erste Zeile wird der Titel.",
  "",
  "Schreib in Markdown und schalte auf Vorschau, um es zu lesen.",
  "",
  "- Neue Notiz — Strg oder ⌘ N",
  "- Suche — Strg oder ⌘ K",
  "- Vorschau — Strg oder ⌘ \\",
  "- Nächste Notiz — Alt und die Pfeiltasten",
  "",
  "> Seite merken übernimmt die offene Seite.",
].join("\n");

const MARKS = [
  "# Ein paar Zeichen",
  "",
  "Markdown ist einfacher Text mit leichter Struktur.",
  "",
  "## Liste",
  "",
  "- [x] Heft öffnen",
  "- [ ] Den nächsten Satz schreiben",
  "",
  "*Leise*, **deutlich**, und `Code` für Namen.",
  "",
  "Ein [Link](https://de.wikipedia.org/wiki/Markdown) bleibt ein Link.",
  "",
  "> Der Tisch ist frei.",
].join("\n");

const MARKET = [
  "# Samstagsmarkt",
  "",
  "Eier, Roggen, und Thymian, wenn er gut aussieht.",
  "",
  "Honig: das dunkle Glas, nicht der Klee.",
  "",
  "Zurück bis vier.",
].join("\n");

const state = {
  notes: [],
  selectedId: null,
  query: "",
  preview: false,
  view: "list",
  dialog: null,
  ready: false,
  now: Date.now(),
};

const app = document.getElementById("app");
let saveTimer = 0;

function uid() {
  return crypto.randomUUID();
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "\u0026amp;";
      case "<":
        return "\u0026lt;";
      case ">":
        return "\u0026gt;";
      case '"':
        return "\u0026quot;";
      default:
        return "\u0026#39;";
    }
  });
}

function chromeStore() {
  try {
    return globalThis.chrome?.storage?.local ?? null;
  } catch {
    return null;
  }
}

function seed(now = Date.now()) {
  return [
    { id: uid(), body: WELCOME, createdAt: now - 60_000, updatedAt: now - 60_000 },
    { id: uid(), body: MARKS, createdAt: now - 86_400_000, updatedAt: now - 5 * 3_600_000 },
    { id: uid(), body: MARKET, createdAt: now - 3 * 86_400_000, updatedAt: now - 26 * 3_600_000 },
  ];
}

function isNote(value) {
  return (
    value &&
    typeof value.id === "string" &&
    typeof value.body === "string" &&
    typeof value.createdAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

async function loadState() {
  const store = chromeStore();
  if (store) {
    const data = await store.get(KEY);
    return data?.[KEY] ?? null;
  }
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

function saveState() {
  const payload = {
    notes: state.notes,
    selectedId: state.selectedId,
    preview: state.preview,
  };
  const store = chromeStore();
  if (store) {
    store.set({ [KEY]: payload });
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(payload));
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 120);
}

function noteTitle(body) {
  const line = body
    .split("\n")
    .map((entry) => entry.trim())
    .find(Boolean);
  if (!line) return "Ohne Titel";
  const stripped = line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*]\s+(\[[ xX]\]\s+)?/, "")
    .replace(/[*_`]/g, "")
    .trim();
  return stripped || "Ohne Titel";
}

function cleanLine(line) {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*]\s+(\[[ xX]\]\s+)?/, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .trim();
}

function noteSnippet(body, query = "") {
  const lines = body
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const q = query.trim().toLowerCase();
  if (q) {
    const hit = lines.find((line) => line.toLowerCase().includes(q));
    if (hit) return cleanLine(hit).slice(0, 96);
  }
  const rest = lines.slice(1).map(cleanLine).find(Boolean);
  return rest ? rest.slice(0, 96) : "";
}

function sortNotes(notes) {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
}

function filteredNotes() {
  const sorted = sortNotes(state.notes);
  const q = state.query.trim().toLowerCase();
  if (!q) return sorted;
  return sorted.filter((note) => `${noteTitle(note.body)}\n${note.body}`.toLowerCase().includes(q));
}

function selectedNote() {
  return state.notes.find((note) => note.id === state.selectedId) ?? null;
}

function wordCount(body) {
  return body.trim().match(/\S+/g)?.length ?? 0;
}

function wordsLabel(count) {
  return count === 1 ? "1 Wort" : `${count} Wörter`;
}

function editedLabel(ts) {
  const delta = Math.max(0, state.now - ts);
  if (delta < 45_000) return "Gerade eben";
  const minutes = Math.round(delta / 60_000);
  if (minutes < 60) return minutes === 1 ? "vor 1 Minute" : `vor ${minutes} Minuten`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "vor 1 Stunde" : `vor ${hours} Stunden`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;
  return new Date(ts).toLocaleDateString("de-DE");
}

function highlight(text, query) {
  const safe = esc(text);
  const needle = query.trim();
  if (!needle) return safe;
  const pattern = new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  return safe.replace(pattern, "<mark>$1</mark>");
}

function safeUrl(url) {
  const value = url.trim().replace(/\u0026amp;/g, "\u0026");
  return /^https?:\/\//i.test(value) ? value : "";
}

function inlineMd(source) {
  return esc(source)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
      const href = safeUrl(url);
      return href
        ? `<a href="${esc(href)}" target="_blank" rel="noreferrer noopener">${text}</a>`
        : text;
    });
}

function renderMarkdown(body) {
  if (!body.trim()) return `<p class="read-empty">Noch nichts zum Lesen.</p>`;
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let list = null;
  let quote = [];
  let code = null;

  const closeList = () => {
    if (!list) return;
    html.push(list.type === "ol" ? "</ol>" : "</ul>");
    list = null;
  };
  const closeQuote = () => {
    if (!quote.length) return;
    html.push(`<blockquote><p>${quote.map(inlineMd).join("<br>")}</p></blockquote>`);
    quote = [];
  };

  for (const line of lines) {
    if (code) {
      if (line.trim().startsWith("```")) {
        html.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
        code = null;
      } else code.push(line);
      continue;
    }
    if (line.trim().startsWith("```")) {
      closeList();
      closeQuote();
      code = [];
      continue;
    }
    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      closeList();
      quote.push(quoteMatch[1]);
      continue;
    }
    closeQuote();
    if (!line.trim()) {
      closeList();
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      closeList();
      html.push("<hr>");
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMd(heading[2])}</h${level}>`);
      continue;
    }
    const task = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (task) {
      if (list?.type !== "ul") {
        closeList();
        html.push("<ul>");
        list = { type: "ul" };
      }
      const checked = task[1].toLowerCase() === "x" ? " checked" : "";
      html.push(`<li><label><input type="checkbox" disabled${checked}>${inlineMd(task[2])}</label></li>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (list?.type !== "ul") {
        closeList();
        html.push("<ul>");
        list = { type: "ul" };
      }
      html.push(`<li>${inlineMd(bullet[1])}</li>`);
      continue;
    }
    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      if (list?.type !== "ol") {
        closeList();
        html.push("<ol>");
        list = { type: "ol" };
      }
      html.push(`<li>${inlineMd(ordered[1])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${inlineMd(line)}</p>`);
  }
  if (code) html.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
  closeList();
  closeQuote();
  return `<div class="md">${html.join("")}</div>`;
}

function icon(name) {
  const paths = {
    plus: `<path d="M12 5v14M5 12h14"/>`,
    search: `<circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/>`,
    trash: `<path d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13"/>`,
    x: `<path d="M6 6l12 12M18 6 6 18"/>`,
    back: `<path d="M15 5 8 12l7 7"/>`,
    clip: `<path d="M8 7.5V16a4 4 0 0 0 8 0V6.5a2.5 2.5 0 0 0-5 0V15"/>`,
    keys: `<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>`,
  };
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

function keysLabel() {
  const mod = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Strg";
  return [
    ["Neue Notiz", [mod, "N"]],
    ["Suche", [mod, "K"]],
    ["Vorschau", [mod, "\\"]],
    ["Nächste", ["Alt", "↓"]],
    ["Vorherige", ["Alt", "↑"]],
    ["Löschen", [mod, "⇧", "⌫"]],
  ];
}

function layoutClass() {
  const wide =
    document.documentElement.classList.contains("full") && window.matchMedia("(min-width: 800px)").matches;
  document.documentElement.classList.toggle("is-editing", state.view === "edit" && !wide);
  document.documentElement.dataset.preview = state.preview ? "true" : "false";
}

function render() {
  const editor = document.getElementById("note-editor");
  const search = document.getElementById("note-search");
  const snapshot = {
    editorStart: editor?.selectionStart,
    editorEnd: editor?.selectionEnd,
    editorScroll: editor?.scrollTop ?? 0,
    searchStart: search?.selectionStart,
    listScroll: document.querySelector(".note-scroll")?.scrollTop ?? 0,
    focus: document.activeElement?.id || "",
  };
  layoutClass();
  const notes = filteredNotes();
  const selected = selectedNote();
  const title = selected ? noteTitle(selected.body) : "Heft";
  const count = state.query.trim()
    ? notes.length === 1
      ? "1 Treffer"
      : `${notes.length} Treffer`
    : state.notes.length === 1
      ? "1 Notiz"
      : `${state.notes.length} Notizen`;

  const list = notes.length
    ? `<ul class="note-list" id="note-list">${notes
        .map((note) => {
          const current = note.id === state.selectedId;
          return `<li><button type="button" class="note-btn" id="note-${note.id}" data-act="open" data-id="${note.id}" ${
            current ? 'aria-current="true"' : ""
          }><span class="note-title">${highlight(noteTitle(note.body), state.query)}</span>${
            noteSnippet(note.body, state.query)
              ? `<span class="note-snippet">${highlight(noteSnippet(note.body, state.query), state.query)}</span>`
              : ""
          }<span class="note-time">${esc(editedLabel(note.updatedAt))}</span></button></li>`;
        })
        .join("")}</ul>`
    : `<div class="empty-list"><p>${state.query.trim() ? "Keine Treffer" : "Noch keine Notiz"}</p><p>${
        state.query.trim() ? `Nichts enthält „${esc(state.query.trim())}“.` : "Leg eine Notiz an."
      }</p></div>`;

  const sheet = !state.ready
    ? `<div class="empty-sheet"><p class="empty-copy">Heft wird geöffnet…</p></div>`
    : selected
      ? `<header class="toolbar"><p class="edited">${esc(
          editedLabel(selected.updatedAt) === "Gerade eben"
            ? "Gerade eben bearbeitet"
            : `Bearbeitet ${editedLabel(selected.updatedAt)}`,
        )}</p><div class="seg" role="radiogroup" aria-label="Ansicht" data-preview="${
          state.preview ? "true" : "false"
        }"><i></i><button type="button" role="radio" data-act="write" aria-checked="${
          state.preview ? "false" : "true"
        }">Schreiben</button><button type="button" role="radio" data-act="preview" aria-checked="${
          state.preview ? "true" : "false"
        }">Vorschau</button></div><button type="button" class="icon-btn" data-act="ask-delete" aria-label="Notiz löschen">${icon(
          "trash",
        )}</button></header><div class="canvas"><div class="write"><textarea id="note-editor" class="write-area" aria-label="${esc(
          title,
        )}, Markdown" placeholder="Beginne mit einem Titel…" spellcheck="true">${esc(
          selected.body,
        )}</textarea></div>${
          state.preview ? `<div class="read">${renderMarkdown(selected.body)}</div>` : ""
        }</div><footer class="status"><span class="tabular">${wordsLabel(
          wordCount(selected.body),
        )}</span><span>Auf diesem Gerät</span></footer>`
      : `<div class="empty-sheet"><h2>Keine Notiz</h2><p class="empty-copy">Sie bleibt auf diesem Gerät.</p><button type="button" class="btn btn-primary" data-act="create">Neue Notiz</button></div>`;

  const dialog =
    state.dialog === "delete"
      ? `<div class="overlay"><div class="dialog" role="alertdialog" aria-labelledby="dlg-title"><h2 id="dlg-title">Notiz löschen</h2><p>„${esc(
          title,
        )}“ wird von diesem Gerät entfernt. Das lässt sich nicht rückgängig machen.</p><div class="dialog-actions"><button type="button" class="btn btn-ghost" data-act="cancel">Abbrechen</button><button type="button" class="btn btn-primary" data-act="confirm-delete">Löschen</button></div></div></div>`
      : state.dialog === "help"
        ? `<div class="overlay"><div class="dialog" role="dialog" aria-labelledby="help-title"><div class="dialog-head"><h2 id="help-title">Tasten</h2><button type="button" class="icon-btn" data-act="cancel" aria-label="Schließen">${icon(
            "x",
          )}</button></div><p>Gilt in der Liste, in der Suche und beim Schreiben.</p><ul class="shortcut-list">${keysLabel()
            .map(
              ([name, keys]) =>
                `<li><span>${name}</span><span class="keys">${keys.map((key) => `<kbd>${esc(key)}</kbd>`).join("")}</span></li>`,
            )
            .join(
              "",
            )}</ul></div></div>`
        : "";

  app.innerHTML = `<div class="app"><header class="top"><button type="button" class="back" data-act="back">${icon(
    "back",
  )}Notizen</button><p class="mark">Heft</p><div class="top-actions"><button type="button" class="icon-btn" data-act="clip" aria-label="Seite merken" title="Seite merken">${icon(
    "clip",
  )}</button><button type="button" class="icon-btn primary" id="new-note" data-act="create" aria-label="Neue Notiz" title="Neue Notiz">${icon(
    "plus",
  )}</button></div></header><div class="body"><aside class="rail" aria-label="Notizen"><div class="search-wrap"><div class="search">${icon(
    "search",
  )}<input id="note-search" type="search" placeholder="Notizen suchen" aria-label="Notizen suchen" value="${esc(
    state.query,
  )}" autocomplete="off" spellcheck="false"></div></div><div class="note-scroll"><p class="count" aria-live="polite">${count}</p>${list}</div><footer class="rail-foot"><button type="button" class="text-btn" data-act="help">${icon(
    "keys",
  )}Tasten</button></footer></aside><section class="sheet" aria-label="Editor">${sheet}</section></div>${dialog}</div>`;

  const nextEditor = document.getElementById("note-editor");
  const nextSearch = document.getElementById("note-search");
  const nextList = document.querySelector(".note-scroll");
  if (nextList) nextList.scrollTop = snapshot.listScroll;
  if (snapshot.focus === "note-editor" && nextEditor && snapshot.editorStart != null) {
    nextEditor.focus();
    nextEditor.setSelectionRange(snapshot.editorStart, snapshot.editorEnd);
    nextEditor.scrollTop = snapshot.editorScroll;
  } else if (snapshot.focus === "note-search" && nextSearch) {
    nextSearch.focus();
    const pos = snapshot.searchStart ?? nextSearch.value.length;
    nextSearch.setSelectionRange(pos, pos);
  } else if (state.view === "edit" && nextEditor && snapshot.focus !== "note-search") {
    if (!snapshot.focus) nextEditor.focus();
  }
}

function selectNote(id, editing) {
  state.selectedId = id;
  if (editing) state.view = "edit";
  scheduleSave();
  render();
}

function createNote(body = "") {
  const current = selectedNote();
  if (!body && current && current.body.trim() === "") {
    state.view = "edit";
    state.selectedId = current.id;
    render();
    document.getElementById("note-editor")?.focus();
    return;
  }
  const now = Date.now();
  const note = { id: uid(), body, createdAt: now, updatedAt: now };
  state.notes.unshift(note);
  state.selectedId = note.id;
  state.query = "";
  state.view = "edit";
  state.preview = false;
  scheduleSave();
  render();
  const field = document.getElementById("note-editor");
  field?.focus();
  const end = field?.value.length ?? 0;
  field?.setSelectionRange(end, end);
}

function deleteSelected() {
  const id = state.selectedId;
  if (!id) return;
  state.notes = state.notes.filter((note) => note.id !== id);
  state.selectedId = sortNotes(state.notes)[0]?.id ?? null;
  state.dialog = null;
  state.view = state.selectedId ? "edit" : "list";
  scheduleSave();
  render();
}

async function rememberPage() {
  let title = "Beispielseite";
  let url = "https://example.com";
  let note = "In Quetta übernimmt Heft Titel und Adresse der offenen Seite.";
  try {
    const tabs = globalThis.chrome?.tabs;
    if (tabs?.query) {
      const [tab] = await tabs.query({ active: true, currentWindow: true });
      if (tab?.url && !/^(chrome|edge|about|chrome-extension):/i.test(tab.url)) {
        title = (tab.title || "Seite").replace(/\s+/g, " ").trim();
        url = tab.url;
        note = "";
      }
    }
  } catch {
    /* preview has no tab access */
  }
  const body = [`# ${title}`, "", url, "", note].filter((line, index, all) => line || all[index - 1]).join("\n");
  createNote(`${body.trim()}\n`);
}

function move(delta) {
  const list = filteredNotes();
  if (!list.length) return;
  const index = list.findIndex((note) => note.id === state.selectedId);
  const next = list[(index + delta + list.length) % list.length];
  if (next) selectNote(next.id, state.view === "edit");
}

function onKey(event) {
  if (!state.ready || state.dialog) {
    if (event.key === "Escape") state.dialog = null;
    else return;
    render();
    return;
  }
  const meta = event.metaKey || event.ctrlKey;
  const typing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
  if (meta && event.key.toLowerCase() === "n" && !event.repeat) {
    event.preventDefault();
    createNote();
    return;
  }
  if (meta && event.key.toLowerCase() === "k" && !event.repeat) {
    event.preventDefault();
    state.view = "list";
    render();
    const field = document.getElementById("note-search");
    field?.focus();
    field?.select();
    return;
  }
  if (meta && event.code === "Backslash" && !event.repeat) {
    event.preventDefault();
    if (state.selectedId) {
      state.preview = !state.preview;
      state.view = "edit";
      render();
    }
    return;
  }
  if (meta && event.shiftKey && event.key === "Backspace" && !event.repeat) {
    event.preventDefault();
    if (state.selectedId) state.dialog = "delete";
    render();
    return;
  }
  if (event.key === "Escape") {
    if (state.view === "edit" && !window.matchMedia("(min-width: 800px)").matches) {
      state.view = "list";
      render();
    } else if (event.target === document.getElementById("note-search") && state.query) {
      state.query = "";
      render();
    }
    return;
  }
  if (event.altKey && !meta && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    event.preventDefault();
    move(event.key === "ArrowDown" ? 1 : -1);
  }
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-act]");
  if (!button) return;
  const act = button.dataset.act;
  if (act === "create") createNote();
  if (act === "clip") void rememberPage();
  if (act === "open") selectNote(button.dataset.id, true);
  if (act === "back") {
    state.view = "list";
    render();
  }
  if (act === "write") {
    state.preview = false;
    render();
  }
  if (act === "preview") {
    state.preview = true;
    state.view = "edit";
    render();
  }
  if (act === "ask-delete") {
    state.dialog = "delete";
    render();
  }
  if (act === "confirm-delete") deleteSelected();
  if (act === "cancel") {
    state.dialog = null;
    render();
  }
  if (act === "help") {
    state.dialog = "help";
    render();
  }
});

app.addEventListener("input", (event) => {
  if (event.target.id === "note-search") {
    state.query = event.target.value;
    render();
    return;
  }
  if (event.target.id === "note-editor") {
    const note = selectedNote();
    if (!note) return;
    note.body = event.target.value;
    note.updatedAt = Date.now();
    state.now = Date.now();
    scheduleSave();
    render();
  }
});

window.addEventListener("keydown", onKey);
window.addEventListener("pagehide", saveState);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveState();
});
window.addEventListener("resize", () => layoutClass());
setInterval(() => {
  state.now = Date.now();
  if (state.ready && document.visibilityState !== "hidden") render();
}, 30_000);

function applySaved(saved) {
  const notes = Array.isArray(saved?.notes) ? saved.notes.filter(isNote) : [];
  if (!notes.length) {
    const seeded = seed();
    state.notes = seeded;
    state.selectedId = seeded[0].id;
    saveState();
  } else {
    state.notes = notes;
    state.selectedId = notes.some((note) => note.id === saved.selectedId)
      ? saved.selectedId
      : sortNotes(notes)[0].id;
    state.preview = Boolean(saved.preview);
  }
  state.ready = true;
  state.now = Date.now();
  const wide =
    document.documentElement.classList.contains("full") && window.matchMedia("(min-width: 800px)").matches;
  state.view = wide ? "edit" : "list";
  render();
}

if (chromeStore()) {
  loadState().then(applySaved);
} else {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    saved = null;
  }
  applySaved(saved);
}
