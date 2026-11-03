/* HEX/RGB parsing and palette extraction from an uploaded logo. */
function rgbToHex(r, g, b) {
  function part(n) {
    var hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }
  return "#" + part(r) + part(g) + part(b);
}

function colorParts(hex) {
  var value = parseHex(hex);
  if (!value) {
    return null;
  }
  var n = parseInt(value.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function parseHex(raw) {
  var value = String(raw || "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    return ("#" + value.charAt(0) + value.charAt(0) + value.charAt(1) + value.charAt(1) + value.charAt(2) + value.charAt(2)).toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(value)) {
    return ("#" + value).toLowerCase();
  }
  return null;
}

function parseRgb(raw) {
  var value = String(raw || "").trim();
  var match = value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i) || value.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/);
  if (!match) {
    return null;
  }
  var r = Number(match[1]);
  var g = Number(match[2]);
  var b = Number(match[3]);
  if (r > 255 || g > 255 || b > 255) {
    return null;
  }
  return rgbToHex(r, g, b);
}

function hexToRgbText(hex) {
  var rgb = colorParts(hex);
  if (!rgb) {
    return "";
  }
  return rgb.r + ", " + rgb.g + ", " + rgb.b;
}

function colorLuminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function extractLogoPalette(src) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () {
      var size = 96;
      var canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, size, size);
      var data = ctx.getImageData(0, 0, size, size).data;
      var buckets = {};
      var opaque = 0;
      var i;
      var r;
      var g;
      var b;
      var key;
      for (i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 96) {
          continue;
        }
        opaque += 1;
        r = Math.min(255, Math.round(data[i] / 16) * 16);
        g = Math.min(255, Math.round(data[i + 1] / 16) * 16);
        b = Math.min(255, Math.round(data[i + 2] / 16) * 16);
        key = r + "," + g + "," + b;
        if (!buckets[key]) {
          buckets[key] = { r: r, g: g, b: b, n: 0, lum: colorLuminance(r, g, b) };
        }
        buckets[key].n += 1;
      }
      var list = Object.keys(buckets).map(function (name) {
        return buckets[name];
      });
      list.sort(function (a, c) {
        return c.n - a.n;
      });
      var minCount = Math.max(6, opaque * 0.012);
      list = list.filter(function (item) {
        return item.n >= minCount;
      });
      var hexes = list.slice(0, 8).map(function (item) {
        return rgbToHex(item.r, item.g, item.b);
      });
      var lights = list.filter(function (item) {
        return item.lum >= 200;
      });
      var darks = list.filter(function (item) {
        return item.lum <= 165;
      }).sort(function (a, c) {
        return a.lum - c.lum;
      });
      var bg = lights.length ? rgbToHex(lights[0].r, lights[0].g, lights[0].b) : "#ffffff";
      var moduleHex = darks.length ? rgbToHex(darks[0].r, darks[0].g, darks[0].b) : hexes[0] || "#111111";
      if (contrastRatio(moduleHex, bg) < 3) {
        moduleHex = "#111111";
        if (contrastRatio(moduleHex, bg) < 3) {
          bg = "#ffffff";
        }
      }
      var eye = moduleHex;
      for (i = 0; i < list.length; i += 1) {
        key = rgbToHex(list[i].r, list[i].g, list[i].b);
        if (key !== moduleHex && key !== bg && contrastRatio(key, bg) >= 2.8) {
          eye = key;
          break;
        }
      }
      resolve({
        colors: hexes.length ? hexes : [moduleHex, bg],
        module: moduleHex,
        eye: eye,
        pupil: moduleHex,
        bg: bg
      });
    };
    img.onerror = function () {
      resolve(null);
    };
    img.src = src;
  });
}
