/* QR layout, SVG/canvas paint, and downloads. Matrix data comes from vendor/qrcode-generator.js. */
function hexToRgb(hex) {
  var h = String(hex || "").replace("#", "");
  if (h.length === 3) {
    h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

function relativeLuminance(hex) {
  var rgb = hexToRgb(hex);
  function lin(channel) {
    var c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

function contrastRatio(a, b) {
  var l1 = relativeLuminance(a);
  var l2 = relativeLuminance(b);
  var hi = Math.max(l1, l2);
  var lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadMarkImage(src) {
  return new Promise(function (resolve) {
    if (!src) {
      resolve(null);
      return;
    }
    var img = new Image();
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function () {
      resolve(null);
    };
    img.src = src;
  });
}

/* The library stores one byte per character. Expand Hebrew to UTF-8 bytes before that. */
function asUtf8Bytes(text) {
  return unescape(encodeURIComponent(String(text)));
}

/* typeNumber 0 lets the library pick the smallest version that fits. */
function makeMatrix(text, ecc) {
  try {
    var qr = qrcode(0, ecc || "M");
    if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs["default"]) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs["default"];
    }
    qr.addData(asUtf8Bytes(text));
    qr.make();
    var n = qr.getModuleCount();
    var matrix = [];
    var r;
    var c;
    for (r = 0; r < n; r += 1) {
      matrix[r] = [];
      for (c = 0; c < n; c += 1) {
        matrix[r][c] = qr.isDark(r, c);
      }
    }
    return matrix;
  } catch (err) {
    return null;
  }
}

function inFinder(row, col, n) {
  function inside(originR, originC) {
    return row >= originR && row < originR + 7 && col >= originC && col < originC + 7;
  }
  return inside(0, 0) || inside(0, n - 7) || inside(n - 7, 0);
}

function finderOrigins(n) {
  return [
    { row: 0, col: 0 },
    { row: 0, col: n - 7 },
    { row: n - 7, col: 0 }
  ];
}

function isDark(matrix, row, col) {
  if (row < 0 || col < 0 || row >= matrix.length || col >= matrix.length) {
    return false;
  }
  return matrix[row][col];
}

function roundedRectPath(x, y, w, h, tl, tr, br, bl) {
  return (
    "M" + (x + tl) + " " + y +
    "L" + (x + w - tr) + " " + y +
    "Q" + (x + w) + " " + y + " " + (x + w) + " " + (y + tr) +
    "L" + (x + w) + " " + (y + h - br) +
    "Q" + (x + w) + " " + (y + h) + " " + (x + w - br) + " " + (y + h) +
    "L" + (x + bl) + " " + (y + h) +
    "Q" + x + " " + (y + h) + " " + x + " " + (y + h - bl) +
    "L" + x + " " + (y + tl) +
    "Q" + x + " " + y + " " + (x + tl) + " " + y +
    "Z"
  );
}

function drawRoundedRect(ctx, x, y, w, h, tl, tr, br, bl) {
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

function frameKind(opts) {
  var frame = opts && opts.frame;
  if (frame === "card" || frame === "scan" || frame === "menu" || frame === "phone") {
    return frame;
  }
  return "plain";
}

function computeLayout(opts) {
  var matrix = makeMatrix(opts.text, opts.ecc);
  if (!matrix) {
    return null;
  }

  var n = matrix.length;
  var quiet = Math.max(1, Number(opts.margin) || 4);
  var target = Math.max(256, Number(opts.size) || 640);
  var kind = frameKind(opts);
  var pad = 0;
  if (kind === "card") {
    pad = Math.round(target * 0.07);
  } else if (kind === "phone") {
    pad = Math.round(target * 0.12);
  } else if (kind === "scan" || kind === "menu") {
    pad = Math.round(target * 0.06);
  }
  var captionText = kind === "card" ? String(opts.caption || "").trim() : "";
  var caption = captionText ? Math.round(target * 0.09) : 0;
  var bubbleText = kind === "scan" || kind === "menu" ? String(opts.frameText || "").trim() : "";
  var bubble = bubbleText ? Math.round(target * 0.16) : 0;
  var inner = target - pad * 2 - caption - bubble;
  var totalMods = n + quiet * 2;
  var module = Math.max(2, Math.floor(inner / totalMods));
  var qrSize = totalMods * module;
  var width = qrSize + pad * 2;
  var height = qrSize + pad * 2 + caption + bubble;

  return {
    matrix: matrix,
    n: n,
    quiet: quiet,
    module: module,
    qrSize: qrSize,
    width: width,
    height: height,
    qrX: pad,
    qrY: pad,
    cardPad: pad,
    caption: caption,
    captionText: captionText,
    bubble: bubble,
    bubbleText: bubbleText,
    kind: kind,
    framed: kind !== "plain"
  };
}

function markBox(layout, ratio) {
  var n = layout.n;
  var pct = Math.min(0.32, Math.max(0.12, Number(ratio) || 0.2));
  var box = Math.max(5, Math.round(n * pct));
  if ((n - box) % 2 !== 0) {
    box += 1;
  }
  var start = (n - box) / 2;
  var x = layout.qrX + (layout.quiet + start) * layout.module;
  var y = layout.qrY + (layout.quiet + start) * layout.module;
  return {
    x: x,
    y: y,
    size: box * layout.module
  };
}

function paintScene(layout, opts, painter, markSrc) {
  var radiusOuter = Math.max(18, layout.width * 0.035);
  var clear = !!opts.transparent && !layout.framed;
  var bg = clear ? "" : opts.bgColor || "#ffffff";

  if (layout.kind === "card") {
    painter.gradientRoundRect(0, 0, layout.width, layout.height, radiusOuter, "#0F172A", "#334155");
    painter.roundRect(7, 7, layout.width - 14, layout.height - 14, radiusOuter - 4, "#ffffff");
  } else if (layout.kind === "phone") {
    painter.roundRect(0, 0, layout.width, layout.height, radiusOuter + 8, "#111827");
    painter.roundRect(10, 18, layout.width - 20, layout.height - 28, radiusOuter, "#ffffff");
    painter.roundRect(layout.width / 2 - 22, 8, 44, 6, 3, "#334155");
  }

  if (bg) {
    painter.roundRect(
      layout.qrX,
      layout.qrY,
      layout.qrSize,
      layout.qrSize,
      layout.framed ? 12 : 0,
      bg
    );
  }

  var originX = layout.qrX + layout.quiet * layout.module;
  var originY = layout.qrY + layout.quiet * layout.module;
  var module = layout.module;
  var matrix = layout.matrix;
  var n = layout.n;
  var shape = opts.moduleShape;
  var moduleFill = opts.moduleColor;
  if (opts.gradient && opts.gradientTo && painter.fillForModules) {
    moduleFill = painter.fillForModules(
      originX,
      originY,
      n * module,
      n * module,
      opts.moduleColor,
      opts.gradientTo,
      opts.gradientAngle
    );
  }
  var r;
  var c;
  var x;
  var y;
  var radius;
  var tl;
  var tr;
  var br;
  var bl;

  for (r = 0; r < n; r += 1) {
    for (c = 0; c < n; c += 1) {
      if (!matrix[r][c] || inFinder(r, c, n)) {
        continue;
      }
      x = originX + c * module;
      y = originY + r * module;
      if (shape === "dots") {
        painter.circle(x + module / 2, y + module / 2, module * 0.42, moduleFill);
      } else if (shape === "rounded") {
        radius = module * 0.48;
        tl = !isDark(matrix, r - 1, c) && !isDark(matrix, r, c - 1) ? radius : 0;
        tr = !isDark(matrix, r - 1, c) && !isDark(matrix, r, c + 1) ? radius : 0;
        br = !isDark(matrix, r + 1, c) && !isDark(matrix, r, c + 1) ? radius : 0;
        bl = !isDark(matrix, r + 1, c) && !isDark(matrix, r, c - 1) ? radius : 0;
        painter.roundRectCorners(x, y, module, module, tl, tr, br, bl, moduleFill);
      } else {
        painter.rect(x, y, module, module, moduleFill);
      }
    }
  }

  finderOrigins(n).forEach(function (origin) {
    paintFinder(
      painter,
      originX + origin.col * module,
      originY + origin.row * module,
      module,
      opts.eyeShape,
      opts.eyeColor,
      opts.pupilColor || opts.eyeColor,
      bg,
      clear
    );
  });

  paintMark(painter, layout, opts, markSrc);

  if (layout.bubble && layout.bubbleText) {
    var bx = Math.round(layout.width * 0.1);
    var bw = layout.width - bx * 2;
    var by = layout.qrY + layout.qrSize + Math.round(layout.bubble * 0.18);
    var bh = Math.round(layout.bubble * 0.72);
    painter.roundRect(bx, by, bw, bh, Math.min(18, bh / 2), "#0F172A");
    var bubbleSize = fitCaptionSize(layout.bubbleText, bw - 24, bh * 0.42);
    var bubbleLine = fitCaptionLine(layout.bubbleText, bw - 24, bubbleSize);
    var bubbleDir = /[\u0590-\u05FF]/.test(bubbleLine) ? "rtl" : "ltr";
    painter.text(bubbleLine, layout.width / 2, by + bh / 2, bubbleSize, "#ffffff", 700, bubbleDir);
  }

  if (layout.kind === "card" && layout.captionText) {
    var maxWidth = layout.width - Math.max(24, layout.cardPad * 1.6);
    var fontSize = fitCaptionSize(layout.captionText, maxWidth, layout.caption * 0.34);
    var line = fitCaptionLine(layout.captionText, maxWidth, fontSize);
    var dir = /[\u0590-\u05FF]/.test(line) ? "rtl" : "ltr";
    painter.text(
      line,
      layout.width / 2,
      layout.qrY + layout.qrSize + layout.caption * 0.52,
      fontSize,
      "#111827",
      700,
      dir
    );
  }
}

function captionMeasureCtx() {
  if (!captionMeasureCtx.ctx && typeof document !== "undefined") {
    captionMeasureCtx.ctx = document.createElement("canvas").getContext("2d");
  }
  return captionMeasureCtx.ctx;
}

function fitCaptionSize(text, maxWidth, maxSize) {
  var size = Math.round(maxSize);
  var min = Math.max(11, Math.round(maxSize * 0.42));
  var ctx = captionMeasureCtx();
  if (!ctx) {
    return Math.min(size, maxWidth / Math.max(1, text.length * 0.55));
  }
  while (size > min) {
    ctx.font = "700 " + size + "px Heebo, Arial, sans-serif";
    if (ctx.measureText(text).width <= maxWidth) {
      return size;
    }
    size -= 1;
  }
  return min;
}

function fitCaptionLine(text, maxWidth, size) {
  var ctx = captionMeasureCtx();
  if (!ctx) {
    return text;
  }
  ctx.font = "700 " + size + "px Heebo, Arial, sans-serif";
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  var i;
  var cut;
  for (i = text.length; i > 1; i -= 1) {
    cut = text.slice(0, i) + "…";
    if (ctx.measureText(cut).width <= maxWidth) {
      return cut;
    }
  }
  return "…";
}

/* White halo, then pad fill, optional outline, then the center mark. */
function paintMark(painter, layout, opts, markSrc) {
  if (!markSrc) {
    return;
  }
  var box = markBox(layout, opts.markRatio);
  var padColor = opts.markPadColor || "#ffffff";
  var borderColor = opts.markBorderColor || "#111111";
  var shape = opts.markShape || "rounded";
  var radius = shape === "square" ? 0 : shape === "circle" ? box.size / 2 : box.size * 0.22;
  var strokeW = box.size * Math.max(0, Math.min(0.18, Number(opts.markBorder) || 0));
  var gap = box.size * Math.max(0, Math.min(0.36, opts.markPad == null ? 0.18 : Number(opts.markPad)));
  var cx = box.x + box.size / 2;
  var cy = box.y + box.size / 2;
  var halo = Math.max(layout.module * 0.9, box.size * 0.08);
  var haloSize = box.size + halo * 2;
  var haloRadius = shape === "circle" ? haloSize / 2 : haloSize * 0.22;

  if (shape === "circle") {
    painter.circle(cx, cy, haloSize / 2, "#ffffff");
  } else {
    painter.roundRect(box.x - halo, box.y - halo, haloSize, haloSize, haloRadius, "#ffffff");
  }

  if (String(padColor).toLowerCase() !== "#ffffff") {
    if (shape === "circle") {
      painter.circle(cx, cy, box.size / 2, padColor);
    } else {
      painter.roundRect(box.x, box.y, box.size, box.size, radius, padColor);
    }
  }

  if (strokeW > 0) {
    if (shape === "circle") {
      painter.strokeCircle(cx, cy, Math.max(0, box.size / 2 - strokeW / 2), borderColor, strokeW);
    } else {
      painter.strokeRoundRect(
        box.x + strokeW / 2,
        box.y + strokeW / 2,
        Math.max(0, box.size - strokeW),
        Math.max(0, box.size - strokeW),
        Math.max(0, radius - strokeW / 2),
        borderColor,
        strokeW
      );
    }
  }

  var inset = Math.min(box.size * 0.42, Math.max(gap, box.size * 0.16) + strokeW);
  painter.image(markSrc, box.x + inset, box.y + inset, box.size - inset * 2, box.size - inset * 2);
}

function paintFinder(painter, x, y, module, shape, color, pupil, bg, clear) {
  var size = module * 7;
  var cx = x + size / 2;
  var cy = y + size / 2;
  var pupilColor = pupil || color;
  var outerR = shape === "rounded" ? module * 1.35 : 0;
  var midR = shape === "rounded" ? module * 0.9 : 0;
  var innerR = shape === "rounded" ? module * 0.45 : 0;

  if (shape === "circle") {
    if (clear) {
      painter.ring(cx, cy, module * 3.5, module * 2.5, color);
    } else {
      painter.circle(cx, cy, module * 3.5, color);
      if (bg) {
        painter.circle(cx, cy, module * 2.5, bg);
      }
    }
    painter.circle(cx, cy, module * 1.5, pupilColor);
    return;
  }

  if (clear) {
    painter.frameRoundRect(x, y, size, size, outerR, module, midR, color);
  } else {
    painter.roundRect(x, y, size, size, outerR, color);
    if (bg) {
      painter.roundRect(x + module, y + module, module * 5, module * 5, midR, bg);
    }
  }
  painter.roundRect(x + module * 2, y + module * 2, module * 3, module * 3, innerR, pupilColor);
}

function svgPainter() {
  var parts = [];
  var gradients = [];
  var gradCount = 0;

  function add(node) {
    parts.push(node);
  }

  return {
    defs: function () {
      return gradients.join("");
    },
    body: function () {
      return parts.join("");
    },
    rect: function (x, y, w, h, fill) {
      add('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"/>');
    },
    roundRect: function (x, y, w, h, r, fill) {
      add(
        '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
          '" rx="' + r + '" ry="' + r + '" fill="' + fill + '"/>'
      );
    },
    roundRectCorners: function (x, y, w, h, tl, tr, br, bl, fill) {
      add('<path d="' + roundedRectPath(x, y, w, h, tl, tr, br, bl) + '" fill="' + fill + '"/>');
    },
    circle: function (cx, cy, r, fill) {
      add('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"/>');
    },
    strokeRoundRect: function (x, y, w, h, r, color, width) {
      add(
        '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
          '" rx="' + r + '" ry="' + r + '" fill="none" stroke="' + color +
          '" stroke-width="' + width + '"/>'
      );
    },
    strokeCircle: function (cx, cy, r, color, width) {
      add(
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
          '" fill="none" stroke="' + color + '" stroke-width="' + width + '"/>'
      );
    },
    gradientRoundRect: function (x, y, w, h, r, from, to) {
      gradCount += 1;
      var id = "cardGrad" + gradCount;
      gradients.push(
        '<linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0%" stop-color="' + from + '"/>' +
          '<stop offset="100%" stop-color="' + to + '"/>' +
          "</linearGradient>"
      );
      add(
        '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
          '" rx="' + r + '" ry="' + r + '" fill="url(#' + id + ')"/>'
      );
    },
    image: function (href, x, y, w, h) {
      add(
        '<image href="' + escapeXml(href) + '" x="' + x + '" y="' + y +
          '" width="' + w + '" height="' + h + '" preserveAspectRatio="xMidYMid meet"/>'
      );
    },
    ring: function (cx, cy, rOut, rIn, fill) {
      add(
        '<path fill="' + fill + '" fill-rule="evenodd" d="M ' + cx + " " + (cy - rOut) +
          " a " + rOut + " " + rOut + " 0 1 0 0 " + rOut * 2 +
          " a " + rOut + " " + rOut + " 0 1 0 0 " + -rOut * 2 +
          " M " + cx + " " + (cy - rIn) +
          " a " + rIn + " " + rIn + " 0 1 1 0 " + rIn * 2 +
          " a " + rIn + " " + rIn + " 0 1 1 0 " + -rIn * 2 + '"/>'
      );
    },
    frameRoundRect: function (x, y, w, h, r, inset, rIn, fill) {
      add(
        '<path fill="' + fill + '" fill-rule="evenodd" d="' +
          roundedRectPath(x, y, w, h, r, r, r, r) +
          roundedRectPath(x + inset, y + inset, w - inset * 2, h - inset * 2, rIn, rIn, rIn, rIn) +
          '"/>'
      );
    },
    text: function (value, x, y, size, fill, weight, dir) {
      add(
        '<text x="' + x + '" y="' + y + '" fill="' + fill + '" font-size="' + size +
          '" font-weight="' + weight + '" font-family="Heebo, Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" direction="' +
          (dir || "ltr") +
          '">' +
          escapeXml(value) +
          "</text>"
      );
    },
    fillForModules: function (x, y, w, h, from, to, angle) {
      gradCount += 1;
      var id = "modGrad" + gradCount;
      var rad = ((Number(angle) || 0) % 360) * Math.PI / 180;
      var cx = x + w / 2;
      var cy = y + h / 2;
      var len = Math.sqrt(w * w + h * h) / 2;
      var x1 = cx - Math.cos(rad) * len;
      var y1 = cy - Math.sin(rad) * len;
      var x2 = cx + Math.cos(rad) * len;
      var y2 = cy + Math.sin(rad) * len;
      gradients.push(
        '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + x1 +
          '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '">' +
          '<stop offset="0%" stop-color="' + from + '"/>' +
          '<stop offset="100%" stop-color="' + to + '"/>' +
          "</linearGradient>"
      );
      return "url(#" + id + ")";
    }
  };
}

function canvasPainter(ctx) {
  return {
    rect: function (x, y, w, h, fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);
    },
    roundRect: function (x, y, w, h, r, fill) {
      ctx.fillStyle = fill;
      drawRoundedRect(ctx, x, y, w, h, r, r, r, r);
      ctx.fill();
    },
    roundRectCorners: function (x, y, w, h, tl, tr, br, bl, fill) {
      ctx.fillStyle = fill;
      drawRoundedRect(ctx, x, y, w, h, tl, tr, br, bl);
      ctx.fill();
    },
    circle: function (cx, cy, r, fill) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    },
    strokeRoundRect: function (x, y, w, h, r, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      drawRoundedRect(ctx, x, y, w, h, r, r, r, r);
      ctx.stroke();
    },
    strokeCircle: function (cx, cy, r, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    },
    gradientRoundRect: function (x, y, w, h, r, from, to) {
      var grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, from);
      grad.addColorStop(1, to);
      ctx.fillStyle = grad;
      drawRoundedRect(ctx, x, y, w, h, r, r, r, r);
      ctx.fill();
    },
    image: function (img, x, y, w, h) {
      if (!img) {
        return;
      }
      ctx.drawImage(img, x, y, w, h);
    },
    ring: function (cx, cy, rOut, rIn, fill) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy, rOut, 0, Math.PI * 2);
      ctx.arc(cx, cy, rIn, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
    },
    frameRoundRect: function (x, y, w, h, r, inset, rIn, fill) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      drawRoundedRect(ctx, x, y, w, h, r, r, r, r);
      drawRoundedRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, rIn, rIn, rIn, rIn);
      ctx.fill("evenodd");
    },
    text: function (value, x, y, size, fill, weight, dir) {
      ctx.fillStyle = fill;
      ctx.font = weight + " " + size + "px Heebo, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.direction = dir || "ltr";
      ctx.fillText(value, x, y);
    },
    fillForModules: function (x, y, w, h, from, to, angle) {
      var rad = ((Number(angle) || 0) % 360) * Math.PI / 180;
      var cx = x + w / 2;
      var cy = y + h / 2;
      var len = Math.sqrt(w * w + h * h) / 2;
      var grad = ctx.createLinearGradient(
        cx - Math.cos(rad) * len,
        cy - Math.sin(rad) * len,
        cx + Math.cos(rad) * len,
        cy + Math.sin(rad) * len
      );
      grad.addColorStop(0, from);
      grad.addColorStop(1, to);
      return grad;
    }
  };
}

function renderQrSvg(opts) {
  var layout = computeLayout(opts);
  if (!layout) {
    return "";
  }
  var painter = svgPainter();
  paintScene(layout, opts, painter, opts.markSrc);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + layout.width + " " + layout.height +
    '" width="' + layout.width + '" height="' + layout.height + '">' +
    "<defs>" + painter.defs() + "</defs>" +
    painter.body() +
    "</svg>"
  );
}

function drawQrToCanvas(canvas, opts, markImage) {
  var layout = computeLayout(opts);
  if (!layout) {
    return null;
  }
  canvas.width = layout.width;
  canvas.height = layout.height;
  var ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, layout.width, layout.height);
  paintScene(layout, opts, canvasPainter(ctx), markImage);
  return layout;
}

function downloadFile(blob, filename) {
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1200);
}
