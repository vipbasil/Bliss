import "./style.css";
import { toddlerData } from "./toddlerData.js";
import { excludedNotCharacterIds } from "./excludedNotCharacterIds.js";

const DEFAULT_FLUX_ENDPOINT = "https://dea985e8601d759ce0.gradio.live/";

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(c);
  return node;
}

function img(src, alt) {
  return el("img", {
    src,
    alt,
    style: {
      width: "84px",
      height: "84px",
      objectFit: "contain",
      background: "#fff",
      border: "1px solid rgba(2, 6, 23, 0.14)",
      borderRadius: "12px",
      padding: "6px",
    },
    loading: "lazy",
  });
}

function row(symbol) {
  const id = symbol.id;
  const bliss = `./bliss_svg_id/${id}.svg`;
  const picto = `./picto/${id}.png`;

  const pictoImg = img(picto, `Picto ${id}`);

  const goodId = `good-${id}`;
  const good = el("input", {
    type: "checkbox",
    id: goodId,
  });
  good.checked = true;

  const goodLabel = el(
    "label",
    { for: goodId, style: { fontSize: "13px", color: "#0b1220", fontWeight: "600" } },
    [document.createTextNode("Good")]
  );

  const regen = el(
    "button",
    {
      type: "button",
      disabled: "disabled",
      style: {
        padding: "8px 10px",
        borderRadius: "10px",
        border: "1px solid rgba(2, 6, 23, 0.14)",
        background: "#fff",
        color: "#0b1220",
        fontWeight: "700",
        cursor: "pointer",
      },
    },
    [document.createTextNode("Regenerate")]
  );

  const status = el(
    "div",
    { style: { fontSize: "12px", color: "#64748b", minHeight: "16px" } },
    [document.createTextNode("")] 
  );

  const canRegenerate = () => !good.checked && import.meta.env.DEV;

  const setRegenerateEnabled = () => {
    const enabled = canRegenerate();
    if (enabled) {
      regen.removeAttribute("disabled");
      regen.style.opacity = "1";
    } else {
      regen.setAttribute("disabled", "disabled");
      regen.style.opacity = import.meta.env.DEV ? "0.45" : "0.25";
    }
  };

  good.addEventListener("change", () => setRegenerateEnabled());

  regen.addEventListener("click", async () => {
    if (!canRegenerate()) return;
    setRegenerateEnabled();

    const endpoint = localStorage.getItem("fluxEndpoint") || DEFAULT_FLUX_ENDPOINT;

    regen.setAttribute("disabled", "disabled");
    status.textContent = "Generating…";

    try {
      const res = await fetch(
        `/api/regenerate?id=${encodeURIComponent(id)}&endpoint=${encodeURIComponent(endpoint)}`
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        const details =
          json && json.details && json.details.python ? ` (python: ${json.details.python})` : "";
        throw new Error(`${json.error || `HTTP ${res.status}`}${details}`);
      }
      pictoImg.src = json.url || `./picto/${id}.png?ts=${Date.now()}`;
      status.textContent = "Generated. Check Good to lock, or regenerate again.";
    } catch (e) {
      status.textContent = `Error: ${String(e.message || e)}`;
    } finally {
      setRegenerateEnabled();
    }
  });

  setRegenerateEnabled();

  return el(
    "div",
    {
      style: {
        display: "grid",
        gridTemplateColumns: "100px 28px 100px 1fr",
        alignItems: "center",
        gap: "12px",
        padding: "10px 8px",
        borderBottom: "1px solid rgba(2, 6, 23, 0.10)",
      },
    },
    [
      img(bliss, `Bliss ${id}`),
      el(
        "div",
        { style: { fontSize: "18px", color: "#475569", textAlign: "center" } },
        [document.createTextNode("→")]
      ),
      pictoImg,
      el(
        "div",
        { style: { display: "grid", gap: "4px" } },
        [
          el(
            "div",
            { style: { fontWeight: "700", color: "#0b1220" } },
            [document.createTextNode(`ID ${id}`)]
          ),
          el(
            "div",
            { style: { color: "#475569", fontSize: "13px" } },
            [document.createTextNode(symbol.primary || "")]
          ),
          el(
            "div",
            { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } },
            [
              el("div", { style: { display: "flex", gap: "8px", alignItems: "center" } }, [
                good,
                goodLabel,
              ]),
              regen,
            ]
          ),
          status,
        ]
      ),
    ]
  );
}

function main() {
  const root = document.getElementById("list");
  if (!root) return;

  const symbols = toddlerData.symbols.filter((s) => !excludedNotCharacterIds.has(s.id));

  const endpointRow = el(
    "div",
    {
      style: {
        display: "flex",
        gap: "10px",
        alignItems: "center",
        margin: "10px 0 14px",
        flexWrap: "wrap",
      },
    },
    []
  );
  const endpointLabel = el(
    "div",
    { style: { color: "#475569", fontSize: "13px" } },
    [document.createTextNode("Flux endpoint:")]
  );
  const endpointInput = el("input", {
    type: "text",
    value: localStorage.getItem("fluxEndpoint") || DEFAULT_FLUX_ENDPOINT,
    style: {
      padding: "8px 10px",
      borderRadius: "10px",
      border: "1px solid rgba(2, 6, 23, 0.14)",
      minWidth: "360px",
    },
  });
  endpointInput.addEventListener("change", () => {
    localStorage.setItem("fluxEndpoint", endpointInput.value.trim());
  });
  const endpointNote = el(
    "div",
    { style: { color: "#64748b", fontSize: "12px" } },
    [
      document.createTextNode(
        import.meta.env.DEV
          ? "Regenerate runs locally via /api/regenerate (dev only)."
          : "Regenerate is disabled in production builds."
      ),
    ]
  );
  endpointRow.append(endpointLabel, endpointInput, endpointNote);

  const header = el(
    "div",
    { style: { display: "flex", gap: "10px", alignItems: "baseline", marginBottom: "10px" } },
    [
      el(
        "div",
        { style: { fontWeight: "700", color: "#0b1220" } },
        [document.createTextNode("Mappings")]
      ),
      el(
        "div",
        { style: { color: "#475569", fontSize: "13px" } },
        [document.createTextNode(`${symbols.length} items`)]
      ),
    ]
  );

  const table = el("div", {
    style: {
      border: "1px solid rgba(2, 6, 23, 0.14)",
      borderRadius: "14px",
      overflow: "hidden",
      background: "#fff",
    },
  });

  for (const s of symbols) table.append(row(s));

  root.append(header, endpointRow, table);
}

main();
