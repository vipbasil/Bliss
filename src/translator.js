function normalizeQuery(s) {
  return (s || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[_-]/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeEnglish(s) {
  return normalizeQuery(s).split(" ").filter(Boolean);
}

function escapeHtml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseIds(s) {
  const raw = (s || "").trim();
  if (!raw) return [];
  const parts = raw.split(/[\s,;]+/).filter(Boolean);
  const ids = [];
  for (const p of parts) {
    if (/^\d+$/.test(p)) ids.push(Number(p));
  }
  return ids;
}

function buildIndex(symbols) {
  const byId = new Map();
  const tokenToIds = new Map();

  for (const sym of symbols) {
    byId.set(sym.id, sym);
    for (const phrase of sym.synonyms || []) {
      for (const token of tokenizeEnglish(phrase)) {
        if (!tokenToIds.has(token)) tokenToIds.set(token, []);
        tokenToIds.get(token).push(sym.id);
      }
    }
  }

  for (const [k, v] of tokenToIds.entries()) {
    tokenToIds.set(k, [...new Set(v)]);
  }

  return { byId, tokenToIds };
}

function scoreMatch(q, sym) {
  if (!q) return 0;
  const qNorm = normalizeQuery(q);
  if (!qNorm) return 0;
  let score = 0;
  for (const s of sym.synonyms || []) {
    if (s === qNorm) score += 50;
    if (s.startsWith(qNorm)) score += 18;
    if (s.includes(qNorm)) score += 8;
  }
  if (sym.primary === qNorm) score += 30;
  return score;
}

function renderCard(sym) {
  const label = sym.primary || (sym.synonyms || [])[0] || String(sym.id);
  return `
    <button class="card" data-id="${sym.id}" type="button">
      <img class="card__img" src="${escapeHtml(sym.img)}" alt="${escapeHtml(label)}" />
      <div class="card__label">${escapeHtml(label)}</div>
      <div class="card__meta">ID ${sym.id}</div>
    </button>
  `;
}

function renderChip(sym) {
  const label = sym.primary || (sym.synonyms || [])[0] || String(sym.id);
  return `
    <div class="chip" data-id="${sym.id}">
      <img class="chip__img" src="${escapeHtml(sym.img)}" alt="${escapeHtml(label)}" />
      <div class="chip__label">${escapeHtml(label)}<br /><span class="chip__meta">ID ${sym.id}</span></div>
      <div class="chip__actions">
        <button class="chip__btn" data-action="up" type="button">Up</button>
        <button class="chip__btn chip__btn--danger" data-action="remove" type="button">Remove</button>
      </div>
    </div>
  `;
}

export function initTranslator(data) {
  if (!data || !Array.isArray(data.symbols)) {
    throw new Error("Missing toddler data. Run: npm run build:data");
  }

  const symbols = data.symbols;
  const { byId, tokenToIds } = buildIndex(symbols);

  const englishInput = document.getElementById("englishInput");
  const translateEnglishBtn = document.getElementById("translateEnglishBtn");
  const clearSentenceBtn = document.getElementById("clearSentenceBtn");

  const searchInput = document.getElementById("searchInput");
  const searchCount = document.getElementById("searchCount");
  const results = document.getElementById("results");

  const idsInput = document.getElementById("idsInput");
  const loadIdsBtn = document.getElementById("loadIdsBtn");
  const sentence = document.getElementById("sentence");
  const englishOutput = document.getElementById("englishOutput");

  let selected = [];

  function updateEnglishOutput() {
    const words = selected
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((s) => s.primary || (s.synonyms || [])[0] || String(s.id));
    englishOutput.textContent = words.join(" ");
  }

  function renderSentence() {
    sentence.innerHTML = selected
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map(renderChip)
      .join("");
    updateEnglishOutput();
  }

  function addToSentence(id) {
    if (!byId.has(id)) return;
    selected.push(id);
    renderSentence();
  }

  function setSentenceFromIds(ids) {
    selected = ids.filter((id) => byId.has(id));
    renderSentence();
  }

  function runSearch() {
    const q = searchInput.value;
    const qNorm = normalizeQuery(q);
    if (!qNorm) {
      const top = symbols.slice(0, 30);
      results.innerHTML = top.map(renderCard).join("");
      searchCount.textContent = `${top.length} shown`;
      return;
    }

    const scored = [];
    for (const sym of symbols) {
      const s = scoreMatch(qNorm, sym);
      if (s > 0) scored.push([s, sym]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].id - b[1].id);
    const out = scored.slice(0, 60).map(([, sym]) => sym);
    results.innerHTML = out.map(renderCard).join("");
    searchCount.textContent = `${out.length} match${out.length === 1 ? "" : "es"}`;
  }

  function translateEnglish() {
    const text = englishInput.value;
    const tokens = tokenizeEnglish(text);
    const ids = [];
    for (const t of tokens) {
      const candidates = tokenToIds.get(t);
      if (candidates && candidates.length) ids.push(candidates[0]);
    }
    setSentenceFromIds(ids);
  }

  results.addEventListener("click", (e) => {
    const btn = e.target.closest("button.card");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    addToSentence(id);
  });

  sentence.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const id = Number(chip.dataset.id);
    const action = e.target.dataset.action;
    if (action === "remove") {
      const idx = selected.indexOf(id);
      if (idx >= 0) {
        selected.splice(idx, 1);
        renderSentence();
      }
      return;
    }
    if (action === "up") {
      const idx = selected.indexOf(id);
      if (idx > 0) {
        [selected[idx - 1], selected[idx]] = [selected[idx], selected[idx - 1]];
        renderSentence();
      }
    }
  });

  translateEnglishBtn.addEventListener("click", translateEnglish);
  clearSentenceBtn.addEventListener("click", () => {
    selected = [];
    renderSentence();
  });

  loadIdsBtn.addEventListener("click", () => {
    setSentenceFromIds(parseIds(idsInput.value));
  });

  englishInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") translateEnglish();
  });

  searchInput.addEventListener("input", runSearch);

  runSearch();
  renderSentence();
}

