/* Lucide catalog helpers. Recolor via currentColor. Full glyphs live in vendor/lucide-catalog.js. */
var LUCIDE_SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';

function lucideSvg(inner) {
  return LUCIDE_SVG_OPEN + inner + "</svg>";
}

function lucideCatalogSvg(inner) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' + inner + "</svg>";
}

var NONE_ICON_SVG = lucideSvg(
  '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>'
);

var UPLOAD_ICON_SVG = lucideSvg(
  '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>'
);

var LIBRARY_ICON_SVG = lucideSvg(
  '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>'
);

var ICON_HAYSTACK = {};
var ICON_IDS = Object.keys(typeof LUCIDE_INNER !== "undefined" ? LUCIDE_INNER : {}).sort();

function resolveIconId(id) {
  if (!id || id === "none" || id === "upload") {
    return id || "none";
  }
  if (typeof LUCIDE_ALIASES !== "undefined" && LUCIDE_ALIASES[id]) {
    id = LUCIDE_ALIASES[id];
  }
  return typeof LUCIDE_INNER !== "undefined" && LUCIDE_INNER[id] ? id : "none";
}

function iconSearchHaystack(id) {
  if (!ICON_HAYSTACK[id]) {
    ICON_HAYSTACK[id] = (
      id.replace(/-/g, " ") +
      " " +
      id +
      " " +
      (typeof LUCIDE_TAGS !== "undefined" && LUCIDE_TAGS[id] ? LUCIDE_TAGS[id] : "")
    ).toLowerCase();
  }
  return ICON_HAYSTACK[id];
}

function latinIconQuery(raw) {
  return String(raw || "").replace(/[^A-Za-z0-9\s\-]/g, "");
}

function markIconSvg(id) {
  var resolved = resolveIconId(id);
  if (!resolved || resolved === "none" || resolved === "upload") {
    return "";
  }
  var inner = typeof LUCIDE_INNER !== "undefined" ? LUCIDE_INNER[resolved] : "";
  return inner ? lucideCatalogSvg(inner) : "";
}

function markIconUriFromSvg(svg, color) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(String(svg || "").replace(/currentColor/g, color || "#111111"));
}

function markIconUri(id, color) {
  var svg = markIconSvg(id);
  return svg ? markIconUriFromSvg(svg, color) : "";
}
