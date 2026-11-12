/* National mobile length rules. start = first digit(s) allowed after the country code. */
var DIAL_CODES = [
  "972",
  "1",
  "44",
  "49",
  "33",
  "39",
  "34",
  "31",
  "32",
  "351",
  "41",
  "43",
  "90",
  "971",
  "966",
  "974",
  "962",
  "961",
  "20",
  "27",
  "91",
  "86",
  "81",
  "61",
  "55",
  "52",
  "54",
  "380",
  "7"
];

var MOBILE_RULES = {
  "972": { min: 9, max: 9, start: "5" },
  "1": { min: 10, max: 10 },
  "44": { min: 10, max: 10, start: "7" },
  "49": { min: 10, max: 11, start: "1" },
  "33": { min: 9, max: 9, start: "67" },
  "39": { min: 9, max: 10, start: "3" },
  "34": { min: 9, max: 9, start: "67" },
  "31": { min: 9, max: 9, start: "6" },
  "32": { min: 9, max: 9, start: "4" },
  "351": { min: 9, max: 9, start: "9" },
  "41": { min: 9, max: 9, start: "7" },
  "43": { min: 10, max: 13, start: "6" },
  "90": { min: 10, max: 10, start: "5" },
  "971": { min: 9, max: 9, start: "5" },
  "966": { min: 9, max: 9, start: "5" },
  "974": { min: 8, max: 8, start: "37" },
  "962": { min: 9, max: 9, start: "7" },
  "961": { min: 8, max: 8, start: "3" },
  "20": { min: 10, max: 10, start: "1" },
  "27": { min: 9, max: 9 },
  "91": { min: 10, max: 10 },
  "86": { min: 11, max: 11, start: "1" },
  "81": { min: 10, max: 11 },
  "61": { min: 9, max: 9, start: "4" },
  "55": { min: 10, max: 11 },
  "52": { min: 10, max: 10 },
  "54": { min: 10, max: 10 },
  "380": { min: 9, max: 9 },
  "7": { min: 10, max: 10, start: "9" }
};

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function startsWithAny(value, digits) {
  if (!digits) {
    return true;
  }
  var i;
  for (i = 0; i < digits.length; i += 1) {
    if (value.charAt(0) === digits.charAt(i)) {
      return true;
    }
  }
  return false;
}

function nationalMobileDigits(countryDigits, raw) {
  var trimmed = String(raw || "").trim();
  var digits = digitsOnly(trimmed);
  if (!digits) {
    return "";
  }
  if (digits.indexOf(countryDigits) === 0 && digits.length > countryDigits.length + 6) {
    digits = digits.slice(countryDigits.length);
  }
  if (digits.charAt(0) === "0") {
    digits = digits.slice(1);
  }
  return digits;
}

function normalizePhone(countryDigits, raw) {
  var rule = MOBILE_RULES[countryDigits] || { min: 8, max: 12 };
  var digits = nationalMobileDigits(countryDigits, raw);

  if (!digits) {
    return { ok: false, reason: "empty", min: rule.min, max: rule.max };
  }
  if (digits.length < rule.min) {
    return { ok: false, reason: "short", min: rule.min, max: rule.max, got: digits.length };
  }
  if (digits.length > rule.max) {
    return { ok: false, reason: "long", min: rule.min, max: rule.max, got: digits.length };
  }
  if (rule.start && !startsWithAny(digits, rule.start)) {
    return { ok: false, reason: "mobile", min: rule.min, max: rule.max };
  }

  var e164 = countryDigits + digits;
  if (e164.length < 8 || e164.length > 15) {
    return { ok: false, reason: "long", min: rule.min, max: rule.max };
  }

  return { ok: true, e164: e164, min: rule.min, max: rule.max };
}

function formatPhoneDisplay(e164, countryDigits) {
  var rest = e164.slice(countryDigits.length);
  if (countryDigits === "972" && rest.length === 9) {
    return "+972 " + rest.slice(0, 2) + "-" + rest.slice(2, 5) + "-" + rest.slice(5);
  }
  if (countryDigits === "1" && rest.length === 10) {
    return "+1 " + rest.slice(0, 3) + "-" + rest.slice(3, 6) + "-" + rest.slice(6);
  }
  return "+" + e164;
}

function isRetiredDemoPhone(value) {
  var digits = digitsOnly(value);
  return digits === "0545690911" || digits === "545690911";
}

function phonePlaceholder(countryDigits) {
  if (countryDigits === "972") {
    return "0541234567";
  }
  if (countryDigits === "1") {
    return "555-123-4567";
  }
  if (countryDigits === "44") {
    return "7400 123456";
  }
  return "050-123-4567";
}
