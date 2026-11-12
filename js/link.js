/* Destination payloads: WhatsApp, website, mailto, tel, Wi-Fi, maps, vCard, iCalendar. */
function copyViaTextarea(text) {
  return new Promise(function (resolve, reject) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      resolve();
    } catch (err) {
      reject(err);
    } finally {
      document.body.removeChild(area);
    }
  });
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(function () {
      return copyViaTextarea(text);
    });
  }
  return copyViaTextarea(text);
}

function buildWhatsappUrl(e164, message) {
  var base = "https://wa.me/" + e164;
  var text = String(message || "").trim();
  if (!text) {
    return base;
  }
  return base + "?text=" + encodeURIComponent(text);
}

function isValidIpv4(host) {
  var parts = String(host || "").split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every(function (part) {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    var n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function isValidDomainLabel(label) {
  if (!label || label.length > 63) {
    return false;
  }
  if (label.charAt(0) === "-" || label.charAt(label.length - 1) === "-") {
    return false;
  }
  return /^(xn--[a-z0-9-]{1,59}|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/i.test(label);
}

function isValidHostname(host) {
  var name = String(host || "").replace(/\.$/, "").toLowerCase();
  if (!name || /\s/.test(name)) {
    return false;
  }
  if (name === "localhost") {
    return true;
  }
  if (isValidIpv4(name)) {
    return true;
  }
  if (name.length > 253 || name.indexOf("..") !== -1) {
    return false;
  }
  var labels = name.split(".");
  if (labels.length < 2) {
    return false;
  }
  var tld = labels[labels.length - 1];
  if (!/^(xn--[a-z0-9-]{2,}|[a-z]{2,63})$/i.test(tld)) {
    return false;
  }
  return labels.every(isValidDomainLabel);
}

function buildWebsiteUrl(raw) {
  var value = String(raw || "").trim();
  if (!value) {
    return { ok: false, reason: "empty" };
  }
  if (/\s/.test(value)) {
    return { ok: false, reason: "format" };
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    value = "https://" + value;
  }
  try {
    var parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, reason: "protocol" };
    }
    if (!isValidHostname(parsed.hostname)) {
      return { ok: false, reason: "host" };
    }
    return { ok: true, url: parsed.toString() };
  } catch (err) {
    return { ok: false, reason: "format" };
  }
}

function isValidEmail(raw) {
  var addr = String(raw || "").trim();
  if (!addr) {
    return { ok: false, reason: "empty" };
  }
  if (addr.length > 254 || /\s/.test(addr)) {
    return { ok: false, reason: "format" };
  }
  var at = addr.indexOf("@");
  if (at < 1 || at !== addr.lastIndexOf("@")) {
    return { ok: false, reason: "format" };
  }
  var local = addr.slice(0, at);
  var domain = addr.slice(at + 1).toLowerCase();
  if (!local || local.length > 64) {
    return { ok: false, reason: "format" };
  }
  if (local.charAt(0) === "." || local.charAt(local.length - 1) === "." || local.indexOf("..") !== -1) {
    return { ok: false, reason: "format" };
  }
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) {
    return { ok: false, reason: "format" };
  }
  if (!isValidHostname(domain) || isValidIpv4(domain) || domain === "localhost") {
    return { ok: false, reason: "format" };
  }
  return { ok: true, email: addr };
}

function buildMailtoUrl(email, subject, body) {
  var checked = isValidEmail(email);
  if (!checked.ok) {
    return checked;
  }
  var url = "mailto:" + checked.email;
  var parts = [];
  var sub = String(subject || "").trim();
  var msg = String(body || "").trim();
  if (sub) {
    parts.push("subject=" + encodeURIComponent(sub));
  }
  if (msg) {
    parts.push("body=" + encodeURIComponent(msg));
  }
  if (parts.length) {
    url += "?" + parts.join("&");
  }
  return { ok: true, url: url };
}

function buildTelUrl(e164) {
  return "tel:+" + e164;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (err) {
    return url;
  }
}

/* WIFI: special characters are escaped so the phone reads the field boundaries. */
function escapeWifiField(value) {
  return String(value || "").replace(/([\\;,:"])/g, "\\$1");
}

function buildWifiPayload(ssid, auth, password, hidden) {
  var name = String(ssid || "").trim();
  if (!name) {
    return { ok: false, reason: "empty" };
  }
  var type = auth === "WEP" || auth === "nopass" ? auth : "WPA";
  var pass = String(password || "");
  if (type !== "nopass" && !pass) {
    return { ok: false, reason: "password" };
  }
  var payload = "WIFI:T:" + type + ";S:" + escapeWifiField(name) + ";";
  if (type !== "nopass") {
    payload += "P:" + escapeWifiField(pass) + ";";
  }
  if (hidden) {
    payload += "H:true;";
  }
  payload += ";";
  return { ok: true, url: payload, caption: name };
}

function buildNavUrl(provider, mode, query, lat, lng) {
  var waze = provider === "waze";
  if (mode === "coords") {
    var la = Number(String(lat || "").replace(",", "."));
    var ln = Number(String(lng || "").replace(",", "."));
    if (!isFinite(la) || !isFinite(ln) || la < -90 || la > 90 || ln < -180 || ln > 180) {
      return { ok: false, reason: "coords" };
    }
    var pair = la + "," + ln;
    if (waze) {
      return { ok: true, url: "https://waze.com/ul?ll=" + pair + "&navigate=yes", caption: pair };
    }
    return {
      ok: true,
      url: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(pair),
      caption: pair
    };
  }
  var q = String(query || "").trim();
  if (!q) {
    return { ok: false, reason: "empty" };
  }
  if (waze) {
    return { ok: true, url: "https://waze.com/ul?q=" + encodeURIComponent(q) + "&navigate=yes", caption: q };
  }
  return {
    ok: true,
    url: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q),
    caption: q
  };
}

function icsEscape(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function hasNonAscii(value) {
  return /[^\u0000-\u007f]/.test(String(value || ""));
}

/* vCard 3.0 needs an explicit charset when the value is not ASCII. */
function vcardLine(name, value) {
  var text = icsEscape(value);
  if (hasNonAscii(value)) {
    return name + ";CHARSET=UTF-8:" + text;
  }
  return name + ":" + text;
}

function safeDecode(value) {
  try {
    return decodeURI(value);
  } catch (err) {
    return value;
  }
}

/* Decode percent-encoded letters for display. The stored URL stays encoded. */
function readableText(value) {
  return String(value || "").replace(/https?:\/\/\S+|mailto:\S+/gi, function (url) {
    var core = url.replace(/[),.;]+$/g, "");
    var tail = url.slice(core.length);
    return safeDecode(core) + tail;
  });
}

/* datetime-local (YYYY-MM-DDTHH:MM) becomes a local iCalendar stamp. */
function toIcsStamp(value) {
  var v = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    return "";
  }
  return v.replace(/[-:]/g, "").slice(0, 13);
}

function buildVEvent(title, start, end, location) {
  var summary = String(title || "").trim();
  var dt = toIcsStamp(start);
  if (!summary) {
    return { ok: false, reason: "empty" };
  }
  if (!dt) {
    return { ok: false, reason: "start" };
  }
  var lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//A.RICH Software//QR Generator//EN",
    "BEGIN:VEVENT",
    "SUMMARY:" + icsEscape(summary),
    "DTSTART:" + dt
  ];
  var dtEnd = toIcsStamp(end);
  if (dtEnd) {
    lines.push("DTEND:" + dtEnd);
  }
  var loc = String(location || "").trim();
  if (loc) {
    lines.push("LOCATION:" + icsEscape(loc));
  }
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");
  return { ok: true, url: lines.join("\r\n"), caption: summary };
}

function buildVCard(name, phone, email, url, org) {
  var fn = String(name || "").trim();
  if (!fn) {
    return { ok: false, reason: "empty" };
  }
  var lines = ["BEGIN:VCARD", "VERSION:3.0", vcardLine("FN", fn), vcardLine("N", fn) + ";;;;"];
  var tel = String(phone || "").trim();
  if (tel) {
    lines.push("TEL:" + tel.replace(/\s+/g, ""));
  }
  var mail = String(email || "").trim();
  if (mail) {
    var checked = isValidEmail(mail);
    if (!checked.ok) {
      return { ok: false, reason: "email" };
    }
    lines.push("EMAIL:" + checked.email);
  }
  var site = String(url || "").trim();
  if (site) {
    var web = buildWebsiteUrl(site);
    if (!web.ok) {
      return { ok: false, reason: "url" };
    }
    lines.push("URL:" + web.url);
  }
  var company = String(org || "").trim();
  if (company) {
    lines.push(vcardLine("ORG", company));
  }
  lines.push("END:VCARD");
  return { ok: true, url: lines.join("\r\n"), caption: fn };
}

function compactLink(url) {
  try {
    var parsed = new URL(url);
    var host = parsed.hostname.replace(/^www\./i, "");
    var path = parsed.pathname === "/" ? "" : safeDecode(parsed.pathname);
    return host + path + safeDecode(parsed.search);
  } catch (err) {
    return String(url || "")
      .replace(/^https:\/\//i, "")
      .replace(/^http:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/$/, "");
  }
}
