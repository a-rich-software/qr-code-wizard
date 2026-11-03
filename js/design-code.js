/* Design-only code. Destination fields (phone, password, message) never go in. */
var DESIGN_CODE_PREFIX = "AR1.";
var DESIGNS_KEY = "arich-qr-designs";
var DESIGNS_MAX = 12;

function encodeDesignCode(design) {
  var json = JSON.stringify(design);
  var b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return DESIGN_CODE_PREFIX + b64;
}

function decodeDesignCode(raw) {
  var text = String(raw || "").trim().replace(/\s+/g, "");
  if (text.indexOf(DESIGN_CODE_PREFIX) !== 0) {
    return null;
  }
  var body = text.slice(DESIGN_CODE_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
  while (body.length % 4) {
    body += "=";
  }
  try {
    var json = decodeURIComponent(escape(atob(body)));
    var data = JSON.parse(json);
    if (!data || data.v !== 1 || typeof data.moduleColor !== "string") {
      return null;
    }
    return data;
  } catch (err) {
    return null;
  }
}

function readSavedDesigns() {
  try {
    var list = JSON.parse(localStorage.getItem(DESIGNS_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function writeSavedDesigns(list) {
  localStorage.setItem(DESIGNS_KEY, JSON.stringify(list.slice(0, DESIGNS_MAX)));
}

function rememberDesign(name, code) {
  var list = readSavedDesigns().filter(function (item) {
    return item && item.code !== code;
  });
  list.unshift({
    id: String(Date.now()),
    name: String(name || "").trim().slice(0, 40),
    code: code,
    savedAt: Date.now()
  });
  writeSavedDesigns(list);
  return list;
}

function forgetDesign(id) {
  var list = readSavedDesigns().filter(function (item) {
    return item && item.id !== id;
  });
  writeSavedDesigns(list);
  return list;
}
