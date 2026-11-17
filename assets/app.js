/* AromAssistant static library app. Loads JSON from data/. */
(() => {
  const DEFAULT_BASE = "apothechrissy";
  const BASES = {
    apothechrissy: { slug: "apothechrissy", name: "ApotheChrissy" },
    aromassistant: { slug: "aromassistant", name: "AromAssistant" },
  };
  const SEARCH_TABLES = [
    "oils",
    "botanical-name",
    "botanical-family",
    "chemical-component",
    "chemical-families",
    "therapeutic-properties",
    "by-uses",
    "recipes",
    "herbs",
  ];
  const PRICE_FIELDS = new Set(["Purchase Price"]);
  const SAFETY_FIELDS = ["Safety", "Safety Info"];
  const PIC_FIELDS = ["Pics", "Attachments"];

  const cache = {};
  const $main = () => document.getElementById("main");

  function displayTableName(name, slug) {
    if (slug === "by-uses") return "Uses";
    if (slug === "vitamins-minerals") return "Vitamins & Minerals";
    return (name || slug || "").replace(/^•/, "");
  }

  function parseHash() {
    let raw = (location.hash || "").replace(/^#/, "");
    if (!raw) raw = "/";
    if (!raw.startsWith("/")) raw = "/" + raw;
    const qIndex = raw.indexOf("?");
    const path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
    const query = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : "");
    const parts = path.split("/").filter(Boolean);
    let base = DEFAULT_BASE;
    if (parts[0] && BASES[parts[0]]) base = parts.shift();
    const head = parts[0] || "search";
    if (head === "search" || head === "browse" || head === "calculator") {
      return { base, page: head, table: null, record: null, q: query.get("q") || "" };
    }
    return {
      base,
      page: parts[1] ? "record" : "table",
      table: head,
      record: parts[1] || null,
      q: query.get("q") || "",
    };
  }

  function hrefFor(state) {
    const b = state.base || DEFAULT_BASE;
    if (state.page === "record") return `#/${b}/${state.table}/${state.record}`;
    if (state.page === "table") {
      const q = state.q ? `?q=${encodeURIComponent(state.q)}` : "";
      return `#/${b}/${state.table}${q}`;
    }
    if (state.page === "browse") return `#/${b}/browse`;
    if (state.page === "calculator") return `#/${b}/calculator`;
    const q = state.q ? `?q=${encodeURIComponent(state.q)}` : "";
    return `#/${b}/search${q}`;
  }

  function go(partial) {
    const cur = parseHash();
    location.hash = hrefFor({ ...cur, ...partial });
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
    return res.json();
  }

  async function loadBase(slug) {
    if (cache[slug]) return cache[slug];
    const schema = await fetchJson(`schema/${slug}.json`);
    const tables = {};
    const byId = {};
    const tableById = {};
    await Promise.all(
      schema.tables.map(async (t) => {
        tableById[t.id] = t;
        const recs = await fetchJson(`data/${slug}/${t.slug}.json`);
        const map = new Map();
        recs.forEach((r) => map.set(r.id, r));
        tables[t.slug] = { def: t, records: recs, byId: map };
        byId[t.id] = tables[t.slug];
      })
    );
    const packed = { schema, tables, byId, tableById };
    cache[slug] = packed;
    return packed;
  }

  function tableOf(data, slug) {
    return data.tables[slug] || null;
  }

  function primaryField(def) {
    return def.fields.find((f) => f.id === def.primaryFieldId) || def.fields[0];
  }

  function primaryValue(rec, def) {
    const f = primaryField(def);
    if (!f) return rec.id;
    const v = rec.fields[f.name];
    if (v == null || v === "") return "(untitled)";
    if (Array.isArray(v)) return v.filter(Boolean).join("; ") || "(untitled)";
    return String(v);
  }

  function fieldByName(def, name) {
    return def.fields.find((f) => f.name === name);
  }

  function linkedTable(data, field) {
    const id = field && field.config && field.config.linkedTableId;
    return id ? data.tableById[id] : null;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function tokenize(q) {
    return q
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function recordText(rec, def) {
    const parts = [];
    for (const f of def.fields) {
      if (PRICE_FIELDS.has(f.name)) continue;
      const v = rec.fields[f.name];
      if (v == null || v === "") continue;
      if (f.type === "multipleRecordLinks") continue;
      if (f.type === "multipleAttachments") {
        if (Array.isArray(v)) v.forEach((a) => a && a.filename && parts.push(a.filename));
        continue;
      }
      if (Array.isArray(v)) parts.push(v.join(" "));
      else parts.push(String(v));
    }
    return parts.join(" \n ").toLowerCase();
  }

  function searchTable(data, slug, query) {
    const t = tableOf(data, slug);
    if (!t) return [];
    const tokens = tokenize(query);
    if (!tokens.length) return [];
    const out = [];
    for (const rec of t.records) {
      const title = primaryValue(rec, t.def).toLowerCase();
      const blob = title + " \n " + recordText(rec, t.def);
      if (!tokens.every((tok) => blob.includes(tok))) continue;
      let rank = 0;
      if (tokens.every((tok) => title.includes(tok))) rank += 40;
      if (title.startsWith(tokens[0])) rank += 20;
      out.push({ rec, def: t.def, slug, title: primaryValue(rec, t.def), rank });
    }
    out.sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title));
    return out;
  }

  function snippetFor(rec, def, query) {
    const tokens = tokenize(query);
    for (const f of def.fields) {
      if (PRICE_FIELDS.has(f.name) || f.type === "multipleRecordLinks" || f.type === "multipleAttachments") continue;
      if (f.id === def.primaryFieldId) continue;
      const v = rec.fields[f.name];
      if (v == null || v === "") continue;
      const text = Array.isArray(v) ? v.join("; ") : String(v);
      const low = text.toLowerCase();
      if (tokens.some((tok) => low.includes(tok))) {
        let cut = text.replace(/\s+/g, " ").trim();
        if (cut.length > 180) cut = cut.slice(0, 177) + "…";
        return cut;
      }
    }
    return "";
  }

  function setChrome(state) {
    document.querySelectorAll(".base-toggle button").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.dataset.base === state.base ? "true" : "false");
    });
    const tab = state.page === "record" || state.page === "table" ? "browse" : state.page;
    ["search", "browse", "calculator"].forEach((name) => {
      const el = document.getElementById("tab-" + name);
      if (!el) return;
      el.setAttribute("aria-current", tab === name ? "page" : null);
      el.setAttribute("href", hrefFor({ base: state.base, page: name, q: name === "search" ? state.q : "" }));
    });
    document.getElementById("home-link").setAttribute("href", hrefFor({ base: state.base, page: "search" }));
    const baseName = BASES[state.base].name;
    document.title =
      state.page === "calculator"
        ? `Drop calculator · ${baseName}`
        : "AromAssistant";
  }

  function recordHref(base, slug, id) {
    return hrefFor({ base, page: "record", table: slug, record: id });
  }

  function renderChips(data, base, field, ids) {
    const target = linkedTable(data, field);
    if (!Array.isArray(ids) || !ids.length) return "";
    const links = ids
      .map((id) => {
        if (!target) return `<span class="chip">${escapeHtml(id)}</span>`;
        const rec = data.tables[target.slug] && data.tables[target.slug].byId.get(id);
        const label = rec ? primaryValue(rec, target) : id;
        return `<a class="chip" href="${recordHref(base, target.slug, id)}">${escapeHtml(label)}</a>`;
      })
      .join("");
    return `<div class="chips">${links}</div>`;
  }

  function attachmentSrc(base, tableSlug, rec, att) {
    if (!att) return "";
    const name = `${rec.id}_${att.id}_${att.filename || "file"}`;
    return `data/${base}/attachments/${tableSlug}/${encodeURIComponent(name).replace(/%2F/g, "/")}`;
  }

  function renderPics(base, slug, rec, def) {
    const atts = [];
    for (const name of PIC_FIELDS) {
      const v = rec.fields[name];
      if (Array.isArray(v)) atts.push(...v);
    }
    if (!atts.length) return "";
    const figs = atts
      .map((att) => {
        const src = attachmentSrc(base, slug, rec, att);
        const alt = att.filename || "Attachment";
        return `<figure><img src="${src}" alt="${escapeHtml(alt)}" loading="lazy"><figcaption>${escapeHtml(alt)}</figcaption></figure>`;
      })
      .join("");
    return `<div class="pics">${figs}</div>`;
  }

  function formatScalar(value) {
    if (value == null) return "";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return String(value);
    return String(value);
  }

  function renderFieldValue(data, base, def, field, rec) {
    const v = rec.fields[field.name];
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "";
    if (field.type === "multipleRecordLinks") return renderChips(data, base, field, v);
    if (field.type === "multipleAttachments") {
      if (!Array.isArray(v)) return "";
      return escapeHtml(v.map((a) => a.filename || a.id).join("; "));
    }
    if (field.type === "multipleSelects" && Array.isArray(v)) {
      return `<div class="chips">${v.map((n) => `<span class="chip">${escapeHtml(n)}</span>`).join("")}</div>`;
    }
    if (field.type === "url") {
      const href = String(v);
      const safe = /^(https?:|mailto:)/i.test(href) ? href : "#";
      return `<a href="${escapeHtml(safe)}" rel="noopener noreferrer" target="_blank">${escapeHtml(href)}</a>`;
    }
    if (field.type === "currency") {
      const n = Number(v);
      return Number.isFinite(n)
        ? n.toLocaleString(undefined, { style: "currency", currency: "USD" })
        : escapeHtml(String(v));
    }
    const text = Array.isArray(v) ? v.join("; ") : formatScalar(v);
    return `<span class="value">${escapeHtml(text)}</span>`;
  }

  function fieldOrder(def) {
    const fields = def.fields.slice();
    const pri = [];
    const mid = [];
    const quiet = [];
    for (const f of fields) {
      if (SAFETY_FIELDS.includes(f.name) || PIC_FIELDS.includes(f.name)) continue;
      if (PRICE_FIELDS.has(f.name)) quiet.push(f);
      else if (f.id === def.primaryFieldId) pri.push(f);
      else mid.push(f);
    }
    return pri.concat(mid, quiet);
  }

  function renderRecord(data, state) {
    const t = tableOf(data, state.table);
    if (!t) return `<p class="error">That table is not in this base.</p>`;
    const rec = t.byId.get(state.record);
    if (!rec) return `<p class="error">Record not found.</p>`;
    const title = primaryValue(rec, t.def);
    document.title = `${title} · ${displayTableName(t.def.name, t.def.slug)}`;
    const crumbs = `<p class="breadcrumb"><a href="${hrefFor({ base: state.base, page: "browse" })}">Browse</a> · <a href="${hrefFor({ base: state.base, page: "table", table: state.table })}">${escapeHtml(displayTableName(t.def.name, t.def.slug))}</a></p>`;
    let safetyHtml = "";
    for (const name of SAFETY_FIELDS) {
      const v = rec.fields[name];
      if (v) {
        safetyHtml += `<aside class="safety"><h2>${escapeHtml(name)}</h2><div class="body">${escapeHtml(String(v))}</div></aside>`;
      }
    }
    const pics = renderPics(state.base, state.table, rec, t.def);
    const body = fieldOrder(t.def)
      .map((f) => {
        const inner = renderFieldValue(data, state.base, t.def, f, rec);
        if (!inner) return "";
        const quiet = PRICE_FIELDS.has(f.name) ? " quiet" : "";
        return `<div class="field${quiet}"><div class="label">${escapeHtml(f.name)}</div><div class="value">${inner}</div></div>`;
      })
      .join("");
    return `${crumbs}<article><p class="kicker">${escapeHtml(displayTableName(t.def.name, t.def.slug))}</p><h1>${escapeHtml(title)}</h1>${safetyHtml}${pics}${body}</article>`;
  }

  function renderTableList(data, state) {
    const t = tableOf(data, state.table);
    if (!t) return `<p class="error">That table is not in this base.</p>`;
    const name = displayTableName(t.def.name, t.def.slug);
    document.title = `${name} · ${BASES[state.base].name}`;
    const q = state.q;
    const recs = q
      ? searchTable(data, state.table, q).map((x) => x.rec)
      : t.records.slice().sort((a, b) => primaryValue(a, t.def).localeCompare(primaryValue(b, t.def)));
    const cards = recs
      .map((rec) => {
        const title = primaryValue(rec, t.def);
        const snip = q ? snippetFor(rec, t.def, q) : "";
        const safety = SAFETY_FIELDS.map((n) => rec.fields[n]).find(Boolean);
        const safetyLine = safety && !q ? `<div class="snippet">${escapeHtml(String(safety).replace(/\s+/g, " ").slice(0, 140))}${String(safety).length > 140 ? "…" : ""}</div>` : "";
        return `<a class="card" href="${recordHref(state.base, t.def.slug, rec.id)}"><h3>${escapeHtml(title)}</h3>${snip ? `<div class="snippet">${escapeHtml(snip)}</div>` : safetyLine}</a>`;
      })
      .join("");
    return `<p class="breadcrumb"><a href="${hrefFor({ base: state.base, page: "browse" })}">Browse</a></p>
      <h1>${escapeHtml(name)}</h1>
      <p class="lede">${recs.length} of ${t.records.length} records</p>
      <form class="search-box" role="search" data-table="${t.def.slug}">
        <input type="search" name="q" placeholder="Filter ${escapeHtml(name).toLowerCase()}…" value="${escapeHtml(q)}" aria-label="Filter this table">
      </form>
      <div class="card-grid">${cards || `<p class="empty">No matching records.</p>`}</div>`;
  }

  function renderBrowse(data, state) {
    document.title = `Browse · ${BASES[state.base].name}`;
    const cards = data.schema.tables
      .map((t) => {
        const n = data.tables[t.slug].records.length;
        return `<a class="table-card" href="${hrefFor({ base: state.base, page: "table", table: t.slug })}"><h3>${escapeHtml(displayTableName(t.name, t.slug))}</h3><div class="count">${n} record${n === 1 ? "" : "s"}</div></a>`;
      })
      .join("");
    return `<h1>Browse</h1><p class="lede">Every table in ${escapeHtml(BASES[state.base].name)}.</p><div class="table-grid">${cards}</div>`;
  }

  function renderSearch(data, state) {
    document.title = state.q ? `${state.q} · Search` : `Search · ${BASES[state.base].name}`;
    const q = state.q;
    let resultsHtml = "";
    if (q.trim()) {
      let total = 0;
      const groups = [];
      for (const slug of SEARCH_TABLES) {
        const hits = searchTable(data, slug, q);
        if (!hits.length) continue;
        total += hits.length;
        const tname = displayTableName(hits[0].def.name, slug);
        const cards = hits
          .slice(0, 40)
          .map((h) => {
            const snip = snippetFor(h.rec, h.def, q);
            return `<a class="card" href="${recordHref(state.base, slug, h.rec.id)}"><h3>${escapeHtml(h.title)}</h3>${snip ? `<div class="snippet">${escapeHtml(snip)}</div>` : ""}</a>`;
          })
          .join("");
        const more = hits.length > 40 ? `<p class="meta"><a href="${hrefFor({ base: state.base, page: "table", table: slug, q })}">See all ${hits.length} in ${escapeHtml(tname)}</a></p>` : "";
        groups.push(`<section class="group"><h2>${escapeHtml(tname)} <span class="count">(${hits.length})</span></h2><div class="card-grid">${cards}</div>${more}</section>`);
      }
      resultsHtml = total
        ? `<p class="lede">${total} result${total === 1 ? "" : "s"} for “${escapeHtml(q)}”.</p>${groups.join("")}`
        : `<p class="empty">No matches for “${escapeHtml(q)}”. Try a botanical or common name, a use, or a recipe.</p>`;
    } else {
      const quick = [
        ["oils", "Oils"],
        ["recipes", "Recipes"],
        ["herbs", "Herbs"],
        ["by-uses", "Uses"],
        ["chemical-component", "Chemical components"],
        ["therapeutic-properties", "Therapeutic properties"],
      ]
        .filter(([slug]) => data.tables[slug])
        .map(([slug, label]) => `<a class="table-card" href="${hrefFor({ base: state.base, page: "table", table: slug })}"><h3>${label}</h3><div class="count">${data.tables[slug].records.length} records</div></a>`)
        .join("");
      resultsHtml = `<p class="lede">Search oils, botanical names, families, chemical components, therapeutic properties, uses, recipes, and herbs. Or jump into a table.</p><div class="table-grid">${quick}</div>`;
    }
    return `<h1>Search</h1>
      <form class="search-box" role="search" data-search="global">
        <input type="search" name="q" placeholder="Search oils, recipes, herbs…" value="${escapeHtml(q)}" aria-label="Search the library" autofocus>
      </form>
      ${resultsHtml}`;
  }

  function renderCalculator(state) {
    document.title = `Drop calculator · ${BASES[state.base].name}`;
    return `<h1>Drop calculator</h1>
      <p class="lede">Number of drops for a blend, using the formula from the Drop Calculator table.</p>
      <div class="calc">
        <div class="calc-grid">
          <div>
            <label for="unit">Unit</label>
            <select id="unit">
              <option value="oz">ounces (oz)</option>
              <option value="mL">milliliters (mL)</option>
            </select>
          </div>
          <div>
            <label for="amount">How much are you making?</label>
            <input id="amount" type="number" min="0" step="0.1" value="3">
          </div>
          <div style="grid-column: 1 / -1">
            <label for="pct">What is your dilution %?</label>
            <input id="pct" type="number" min="0" step="0.1" value="2">
            <div class="presets" role="group" aria-label="Dilution presets">
              <button type="button" data-pct="1">1%</button>
              <button type="button" data-pct="2" aria-pressed="true">2%</button>
              <button type="button" data-pct="3">3%</button>
            </div>
          </div>
        </div>
        <div class="result" aria-live="polite">
          <span class="num" id="drops">36</span>
          <span>drops</span>
        </div>
        <p class="note" id="calc-note">3 oz at 2% = 36 drops (ounces × % × 6).</p>
      </div>
      <div class="guidance">
        <strong>Dilution guidance</strong>
        <ul>
          <li><strong>1%</strong> — children 2+, pregnant or nursing, elderly, or immunocompromised</li>
          <li><strong>2%</strong> — healthy adult</li>
          <li><strong>3%</strong> — acute use: short-term and small area</li>
        </ul>
        <p>Higher percentages should be used with caution and only under special circumstances.</p>
      </div>
      <p class="note">Formula: milliliters use amount × % × 0.2; ounces use amount × % × 6. The sample row in the table (3 oz at 2%) equals 36 drops.</p>`;
  }

  function computeDrops(unit, amount, pct) {
    const a = Number(amount);
    const p = Number(pct);
    if (!Number.isFinite(a) || !Number.isFinite(p)) return null;
    const raw = unit === "mL" ? a * p * 0.2 : a * p * 6;
    return Math.round(raw * 10) / 10;
  }

  function bindCalculator() {
    const unit = document.getElementById("unit");
    const amount = document.getElementById("amount");
    const pct = document.getElementById("pct");
    const out = document.getElementById("drops");
    const note = document.getElementById("calc-note");
    if (!unit || !amount || !pct || !out) return;
    const update = () => {
      const n = computeDrops(unit.value, amount.value, pct.value);
      out.textContent = n == null ? "—" : String(n);
      document.querySelectorAll(".presets button").forEach((b) => {
        b.setAttribute("aria-pressed", Number(b.dataset.pct) === Number(pct.value) ? "true" : "false");
      });
      const label = unit.value === "mL" ? "mL" : "oz";
      const factor = unit.value === "mL" ? "0.2" : "6";
      if (n != null) {
        note.textContent = `${amount.value || 0} ${label} at ${pct.value || 0}% = ${n} drops (${label === "mL" ? "milliliters" : "ounces"} × % × ${factor}).`;
      }
    };
    unit.addEventListener("change", update);
    amount.addEventListener("input", update);
    pct.addEventListener("input", update);
    document.querySelectorAll(".presets button").forEach((b) => {
      b.addEventListener("click", () => {
        pct.value = b.dataset.pct;
        update();
      });
    });
    update();
  }

  function bindForms(state) {
    $main().querySelectorAll("form.search-box").forEach((form) => {
      const input = form.querySelector("input[name=q]");
      const submit = (ev) => {
        ev.preventDefault();
        const q = (input && input.value) || "";
        if (form.dataset.search === "global") go({ page: "search", q, table: null, record: null });
        else go({ page: "table", table: form.dataset.table, q, record: null });
      };
      form.addEventListener("submit", submit);
    });
  }

  async function render() {
    const state = parseHash();
    if (!BASES[state.base]) state.base = DEFAULT_BASE;
    setChrome(state);
    const main = $main();
    if (state.page === "calculator") {
      main.innerHTML = renderCalculator(state);
      bindCalculator();
      return;
    }
    main.innerHTML = `<p class="status">Loading ${escapeHtml(BASES[state.base].name)}…</p>`;
    try {
      const data = await loadBase(state.base);
      if (parseHash().base !== state.base) return;
      if (state.page === "browse") main.innerHTML = renderBrowse(data, state);
      else if (state.page === "table") main.innerHTML = renderTableList(data, state);
      else if (state.page === "record") main.innerHTML = renderRecord(data, state);
      else main.innerHTML = renderSearch(data, state);
      bindForms(state);
      const firstSearch = main.querySelector("input[type=search]");
      if (firstSearch && state.page === "search" && !state.q) firstSearch.focus();
    } catch (err) {
      main.innerHTML = `<p class="error">${escapeHtml(err.message || String(err))}</p>`;
    }
  }

  document.querySelectorAll(".base-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.base;
      const cur = parseHash();
      const page = cur.page === "record" || cur.page === "table" ? "browse" : cur.page;
      go({ base: next, page, table: null, record: null });
    });
  });

  window.addEventListener("hashchange", render);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
