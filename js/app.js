/* Wizard: link type, details, QR options, preview, download, share. */
(function () {
  var STORAGE_KEY = "arich-qr-wizard";
  var SHARE_KEY = "arich-share-dismissed";
  var MESSAGE_MAX = 500;
  var MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  var MAX_PERSIST_MARK = 2200000;
  var ICON_I18N = {
    none: "iconNone",
    upload: "iconCustom",
    library: "iconLibrary"
  };
  var els = {};
  var step = 0;
  var linkType = "";
  var iconId = "none";
  var uploadedMark = "";
  var persistTimer = 0;
  var reached = 0;
  var historyArmed = false;
  var handlingPop = false;
  var lastFocused = null;
  var filteredIconIds = [];
  var iconPool = [];
  var iconSearchTimer = 0;
  var ICON_ROW_H = 44;

  function $(id) {
    return document.getElementById(id);
  }

  function selectedValue(name) {
    var node = document.querySelector('input[name="' + name + '"]:checked');
    return node ? node.value : "";
  }

  function setRadio(name, value) {
    var node = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
    if (node) {
      node.checked = true;
    }
  }

  /* Country list labels follow the active language. */
  function fillDialCodes() {
    var selected = els.dial.value || "972";
    els.dial.innerHTML = "";
    DIAL_CODES.forEach(function (code) {
      var opt = document.createElement("option");
      opt.value = code;
      opt.textContent = "\u200E+" + code + " " + t("country" + code);
      els.dial.appendChild(opt);
    });
    els.dial.value = selected;
    if (els.phone) {
      els.phone.placeholder = phonePlaceholder(els.dial.value);
    }
  }

  function refreshIconLabels() {
    if (els.iconSearch) {
      els.iconSearch.placeholder = I18N.en.iconSearch;
    }
    document.querySelectorAll(".icon-pick").forEach(function (btn) {
      var id = btn.getAttribute("data-icon");
      var span = btn.querySelector("span");
      var key = ICON_I18N[id];
      if (key) {
        var label = t(key);
        btn.setAttribute("aria-label", label);
        btn.title = label;
        if (span) {
          span.textContent = label;
        }
      }
    });
  }

  function refreshChipTemplates() {
    var current = els.message ? els.message.value : "";
    var matched = "";
    ["tplSiteText", "tplQuoteText", "tplAdText", "tplFlyerText"].forEach(function (key) {
      if (current === I18N.en[key] || current === I18N.he[key]) {
        matched = key;
      }
    });
    document.querySelectorAll("[data-i18n-template]").forEach(function (btn) {
      btn.setAttribute("data-template", t(btn.getAttribute("data-i18n-template")));
    });
    if (matched && els.message) {
      els.message.value = t(matched);
    }
  }

  /* Re-apply copy, dir, and fields that are built in JS. */
  function applyLang(lang, persistChoice) {
    setDocumentLang(lang, persistChoice);
    fillDialCodes();
    refreshIconLabels();
    if (els.iconLibrary && !els.iconLibrary.hidden) {
      updateIconMeta();
      paintIconWindow();
    }
    refreshChipTemplates();
    showTypeFields();
    renderSavedDesigns();
    renderPreview();
    updateNextState();
    if (els.shareModal && !els.shareModal.hidden) {
      fillShareLinks();
    }
  }

  function mountColorEditors() {
    document.querySelectorAll(".color-field > input[type='color']").forEach(function (picker) {
      if (picker.parentNode.querySelector(".color-codes")) {
        return;
      }
      var wrap = document.createElement("div");
      wrap.className = "color-codes";
      wrap.innerHTML =
        '<label>HEX<input class="control color-hex" spellcheck="false" maxlength="7" dir="ltr" aria-label="HEX"></label>' +
        '<label>RGB<input class="control color-rgb" spellcheck="false" maxlength="20" dir="ltr" aria-label="RGB"></label>';
      picker.insertAdjacentElement("afterend", wrap);
      var err = document.createElement("p");
      err.className = "field-error color-code-error";
      err.setAttribute("role", "alert");
      wrap.insertAdjacentElement("afterend", err);
      syncColorFields(picker);
    });
  }

  function setColorCodeError(input, key) {
    var field = input && input.closest(".color-field");
    var err = field && field.querySelector(".color-code-error");
    if (!err) {
      return;
    }
    err.textContent = key ? t(key) : "";
  }

  function clearColorCodeError(picker) {
    var field = picker && picker.closest(".color-field");
    if (!field) {
      return;
    }
    var err = field.querySelector(".color-code-error");
    if (err) {
      err.textContent = "";
    }
    field.querySelectorAll(".color-hex, .color-rgb").forEach(function (input) {
      input.removeAttribute("aria-invalid");
    });
  }

  function syncColorFields(picker) {
    var wrap = picker.parentNode.querySelector(".color-codes");
    if (!wrap) {
      return;
    }
    var hex = parseHex(picker.value) || "#000000";
    wrap.querySelector(".color-hex").value = hex.toUpperCase();
    wrap.querySelector(".color-rgb").value = hexToRgbText(hex);
    clearColorCodeError(picker);
  }

  function syncAllColorFields() {
    document.querySelectorAll(".color-field > input[type='color']").forEach(syncColorFields);
  }

  function setColorValue(picker, hex, fromUser) {
    var normalized = parseHex(hex);
    if (!normalized) {
      return false;
    }
    picker.value = normalized;
    syncColorFields(picker);
    if (fromUser) {
      picker.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return true;
  }

  function fillLogoPaletteChips(colors) {
    els.logoSwatches.innerHTML = "";
    (colors || []).forEach(function (hex) {
      els.logoSwatches.appendChild(
        makeSwatch(hex, function () {
          setColorValue(els.moduleColor, hex, true);
          setColorValue(els.eyeColor, hex, false);
          setColorValue(els.pupilColor, hex, false);
          clearPresetSelection();
          renderPreview();
          schedulePersist();
        })
      );
    });
    els.logoPalette.hidden = !(colors && colors.length);
  }

  function applyLogoPalette(palette) {
    if (!palette) {
      fillLogoPaletteChips([]);
      appendLogoSwatches([]);
      return;
    }
    setColorValue(els.moduleColor, palette.module, false);
    setColorValue(els.eyeColor, palette.eye, false);
    setColorValue(els.pupilColor, palette.pupil, false);
    setColorValue(els.bgColor, palette.bg, false);
    els.bgClear.checked = false;
    fillLogoPaletteChips(palette.colors);
    appendLogoSwatches(palette.colors);
    clearPresetSelection();
  }

  function makeSwatch(hex, onPick, fromLogo) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch" + (fromLogo ? " is-from-logo" : "");
    btn.style.background = hex;
    btn.setAttribute("aria-label", hex);
    btn.title = hex;
    btn.addEventListener("click", onPick);
    return btn;
  }

  function appendLogoSwatches(colors) {
    document.querySelectorAll(".swatch.is-from-logo").forEach(function (btn) {
      btn.remove();
    });
    document.querySelectorAll("[data-swatches]").forEach(function (row) {
      var target = $(row.getAttribute("data-swatches"));
      if (!target) {
        return;
      }
      var seen = {};
      (colors || []).forEach(function (hex) {
        var key = String(hex || "").toLowerCase();
        if (!key || seen[key]) {
          return;
        }
        seen[key] = 1;
        row.appendChild(
          makeSwatch(
            hex,
            function () {
              target.value = hex;
              target.dispatchEvent(new Event("input", { bubbles: true }));
            },
            true
          )
        );
      });
    });
  }

  function mountSwatches() {
    document.querySelectorAll("[data-swatches]").forEach(function (row) {
      var target = $(row.getAttribute("data-swatches"));
      COLOR_SWATCHES.forEach(function (hex) {
        row.appendChild(
          makeSwatch(hex, function () {
            target.value = hex;
            target.dispatchEvent(new Event("input", { bubbles: true }));
          })
        );
      });
    });
  }

  function mountIcons() {
    els.iconSpecials.appendChild(iconButton("none", t("iconNone"), NONE_ICON_SVG, true));
    els.iconSpecials.appendChild(
      iconButton("upload", t("iconCustom"), UPLOAD_ICON_SVG, true)
    );
    var libraryBtn = iconButton("library", t("iconLibrary"), LIBRARY_ICON_SVG, true);
    libraryBtn.setAttribute("aria-expanded", "false");
    libraryBtn.setAttribute("aria-controls", "icon-library");
    els.iconSpecials.appendChild(libraryBtn);
    if (els.brandRow && typeof BRAND_MARKS !== "undefined") {
      Object.keys(BRAND_MARKS).forEach(function (id) {
        els.brandRow.appendChild(iconButton(id, BRAND_MARKS[id].label, brandIconSvg(id), true));
      });
    }
    if (els.iconGrid) {
      els.iconGrid.addEventListener("click", onIconGridClick);
    }
    if (els.iconScroller) {
      els.iconScroller.addEventListener(
        "scroll",
        function () {
          paintIconWindow();
        },
        { passive: true }
      );
    }
  }

  function iconButton(id, label, svgMarkup, withLabel) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-pick" + (withLabel ? " is-labeled" : "") + (id === "none" ? " is-on" : "");
    btn.setAttribute("data-icon", id);
    btn.setAttribute("aria-pressed", id === "none" ? "true" : "false");
    btn.setAttribute("aria-label", label);
    btn.title = label;
    if (svgMarkup) {
      btn.insertAdjacentHTML("beforeend", svgMarkup);
    }
    if (withLabel) {
      var span = document.createElement("span");
      span.textContent = label;
      btn.appendChild(span);
    }
    btn.addEventListener("click", function () {
      if (id === "library") {
        setLibraryOpen(els.iconLibrary.hidden);
        return;
      }
      if (id === "upload") {
        setLibraryOpen(false);
        setIcon("upload");
        els.file.click();
        renderPreview();
        schedulePersist();
        return;
      }
      if (id === "none") {
        setLibraryOpen(false);
      }
      setIcon(id);
      renderPreview();
      schedulePersist();
    });
    return btn;
  }

  function onIconGridClick(event) {
    var btn = event.target.closest(".icon-pick");
    if (!btn) {
      return;
    }
    var id = btn.getAttribute("data-icon");
    if (!id) {
      return;
    }
    setIcon(id);
    renderPreview();
    schedulePersist();
    paintIconWindow();
  }

  function iconColumns() {
    var width = (els.iconScroller && els.iconScroller.clientWidth) || 320;
    if (width < 300) {
      return 5;
    }
    if (width < 420) {
      return 6;
    }
    return 8;
  }

  function filterIconGrid(resetScroll) {
    var query = latinIconQuery((els.iconSearch && els.iconSearch.value) || "")
      .trim()
      .toLowerCase();
    var words = query ? query.split(/\s+/).filter(Boolean) : [];
    if (!words.length) {
      filteredIconIds = ICON_IDS.slice();
    } else {
      filteredIconIds = ICON_IDS.filter(function (id) {
        var hay = " " + iconSearchHaystack(id).replace(/-/g, " ") + " ";
        return words.every(function (word) {
          return hay.indexOf(" " + word) !== -1;
        });
      });
    }
    if (els.iconEmpty) {
      els.iconEmpty.hidden = filteredIconIds.length > 0;
    }
    if (els.iconScroller) {
      els.iconScroller.hidden = filteredIconIds.length === 0;
      if (resetScroll) {
        els.iconScroller.scrollTop = 0;
      }
    }
    updateIconMeta();
    paintIconWindow();
  }

  function updateIconMeta() {
    if (!els.iconMeta) {
      return;
    }
    els.iconMeta.textContent = t("iconMeta", {
      shown: String(filteredIconIds.length),
      total: String(ICON_IDS.length)
    });
  }

  function ensureIconPool(n) {
    while (iconPool.length < n) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "icon-pick";
      els.iconGrid.appendChild(btn);
      iconPool.push(btn);
    }
    var i;
    for (i = 0; i < iconPool.length; i += 1) {
      iconPool[i].hidden = i >= n;
    }
  }

  function paintIconWindow() {
    if (!els.iconGrid || !els.iconScroller || els.iconLibrary.hidden) {
      return;
    }
    var cols = iconColumns();
    var total = filteredIconIds.length;
    var rows = Math.max(1, Math.ceil(total / cols));
    els.iconGrid.style.height = rows * ICON_ROW_H + "px";
    var scroll = els.iconScroller.scrollTop;
    var viewH = els.iconScroller.clientHeight || 280;
    var startRow = Math.max(0, Math.floor(scroll / ICON_ROW_H) - 2);
    var endRow = Math.min(rows, Math.ceil((scroll + viewH) / ICON_ROW_H) + 2);
    var start = startRow * cols;
    var end = Math.min(total, endRow * cols);
    var count = Math.max(0, end - start);
    var rtl = document.documentElement.getAttribute("dir") === "rtl";
    var colW = 100 / cols;
    var i;
    ensureIconPool(count);
    for (i = 0; i < count; i += 1) {
      var idx = start + i;
      var id = filteredIconIds[idx];
      var btn = iconPool[i];
      var row = Math.floor(idx / cols);
      var col = idx % cols;
      var label = id.replace(/-/g, " ");
      var on = id === iconId;
      btn.hidden = false;
      btn.setAttribute("data-icon", id);
      btn.setAttribute("aria-label", label);
      btn.title = label;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.style.top = row * ICON_ROW_H + "px";
      btn.style.width = "calc(" + colW + "% - 0.32rem)";
      if (rtl) {
        btn.style.right = "calc(" + col * colW + "% + 0.16rem)";
        btn.style.left = "auto";
      } else {
        btn.style.left = "calc(" + col * colW + "% + 0.16rem)";
        btn.style.right = "auto";
      }
      if (btn.getAttribute("data-svg") !== id) {
        btn.innerHTML = markIconSvg(id);
        btn.setAttribute("data-svg", id);
      }
    }
  }

  function scrollIconIntoView(id) {
    var idx = filteredIconIds.indexOf(id);
    if (idx < 0 || !els.iconScroller) {
      return;
    }
    var top = Math.floor(idx / iconColumns()) * ICON_ROW_H;
    els.iconScroller.scrollTop = Math.max(0, top - els.iconScroller.clientHeight / 3);
  }

  function setLibraryOpen(open) {
    if (!els.iconLibrary) {
      return;
    }
    els.iconLibrary.hidden = !open;
    var libBtn = els.iconSpecials && els.iconSpecials.querySelector('[data-icon="library"]');
    if (libBtn) {
      libBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    if (open) {
      filterIconGrid(false);
      requestAnimationFrame(function () {
        if (iconMode(iconId) === "library") {
          scrollIconIntoView(iconId);
        }
        paintIconWindow();
      });
      els.iconLibrary.scrollIntoView({ block: "nearest" });
      if (els.iconSearch) {
        els.iconSearch.focus();
      }
    }
  }

  function iconMode(id) {
    if (id === "none" || id === "upload") {
      return id;
    }
    if (isBrandIcon(id)) {
      return "brand";
    }
    return "library";
  }

  function setIcon(id) {
    var next = id || "none";
    if (next !== "none" && next !== "upload" && !isBrandIcon(next)) {
      next = resolveIconId(next);
    }
    iconId = next;
    if (iconId !== "upload") {
      uploadedMark = "";
      if (els.file) {
        els.file.value = "";
      }
      if (els.uploadPreview) {
        els.uploadPreview.hidden = true;
      }
      if (typeof applyLogoPalette === "function" && els.logoPalette) {
        applyLogoPalette(null);
      }
      setFileError("");
    }
    var mode = iconMode(iconId);
    var specialOn = mode === "library" ? "library" : mode === "none" || mode === "upload" ? mode : "";
    document.querySelectorAll("#icon-specials .icon-pick").forEach(function (btn) {
      var on = btn.getAttribute("data-icon") === specialOn;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll("#brand-row .icon-pick").forEach(function (btn) {
      var on = btn.getAttribute("data-icon") === iconId;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll(".icon-grid .icon-pick").forEach(function (btn) {
      var on = btn.getAttribute("data-icon") === iconId;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var has = iconId !== "none";
    els.iconControls.hidden = !has;
    els.iconColorWrap.hidden = iconId === "upload" || iconId === "none";
    if (els.dropZone) {
      els.dropZone.hidden = iconId !== "upload";
    }
  }

  function markSrc() {
    if (iconId === "none") {
      return "";
    }
    if (iconId === "upload") {
      return uploadedMark || "";
    }
    if (isBrandIcon(iconId)) {
      return brandIconUri(iconId, els.iconColor.value);
    }
    return markIconUri(iconId, els.iconColor.value);
  }

  function eccLevel() {
    var choice = selectedValue("ecc-level");
    if (choice === "L" || choice === "M" || choice === "Q" || choice === "H") {
      return choice;
    }
    return markSrc() ? "H" : "M";
  }

  function frameIsChrome() {
    var frame = selectedValue("frame");
    return frame === "card" || frame === "scan" || frame === "menu" || frame === "phone";
  }

  function phoneState() {
    return normalizePhone(els.dial.value, els.phone.value);
  }

  /* Build the destination URL for the chosen type, or fail closed. */
  function currentPayload() {
    if (linkType === "whatsapp") {
      var phone = phoneState();
      if (!phone.ok) {
        return { ok: false };
      }
      return {
        ok: true,
        url: buildWhatsappUrl(phone.e164, els.message.value),
        caption: formatPhoneDisplay(phone.e164, els.dial.value),
        captionSub: t("typeWhatsapp"),
        openLabel: t("openWhatsapp")
      };
    }
    if (linkType === "website") {
      var site = buildWebsiteUrl(els.website.value);
      if (!site.ok) {
        return { ok: false };
      }
      return {
        ok: true,
        url: site.url,
        caption: compactLink(site.url),
        captionSub: t("capWebsite"),
        openLabel: t("openWebsite")
      };
    }
    if (linkType === "email") {
      var mail = buildMailtoUrl(els.email.value, els.subject.value, els.body.value);
      if (!mail.ok) {
        return { ok: false };
      }
      return {
        ok: true,
        url: mail.url,
        caption: els.email.value.trim(),
        captionSub: t("capEmail"),
        openLabel: t("openEmail")
      };
    }
    if (linkType === "call") {
      var tel = phoneState();
      if (!tel.ok) {
        return { ok: false };
      }
      return {
        ok: true,
        url: buildTelUrl(tel.e164),
        caption: formatPhoneDisplay(tel.e164, els.dial.value),
        captionSub: t("capCall"),
        openLabel: t("openCall")
      };
    }
    if (linkType === "wifi") {
      var wifi = buildWifiPayload(
        els.wifiSsid.value,
        selectedValue("wifi-auth"),
        els.wifiPass.value,
        els.wifiHidden.checked
      );
      if (!wifi.ok) {
        return { ok: false };
      }
      return { ok: true, url: wifi.url, caption: wifi.caption, captionSub: t("typeWifi"), openLabel: t("resultLegend") };
    }
    if (linkType === "nav") {
      var nav = buildNavUrl(
        selectedValue("nav-provider"),
        selectedValue("nav-mode"),
        els.navQuery.value,
        els.navLat.value,
        els.navLng.value
      );
      if (!nav.ok) {
        return { ok: false };
      }
      return {
        ok: true,
        url: nav.url,
        caption: nav.caption,
        captionSub: selectedValue("nav-provider") === "waze" ? "Waze" : "Google Maps",
        openLabel: t("openWebsite")
      };
    }
    if (linkType === "event") {
      var eventCard = buildVEvent(els.eventTitle.value, els.eventStart.value, els.eventEnd.value, els.eventPlace.value);
      if (!eventCard.ok) {
        return { ok: false };
      }
      return { ok: true, url: eventCard.url, caption: eventCard.caption, captionSub: t("typeEvent"), openLabel: t("resultLegend") };
    }
    if (linkType === "vcard") {
      var card = buildVCard(els.vcardName.value, els.vcardPhone.value, els.vcardEmail.value, els.vcardUrl.value, els.vcardOrg.value);
      if (!card.ok) {
        return { ok: false };
      }
      return { ok: true, url: card.url, caption: card.caption, captionSub: t("typeCard"), openLabel: t("resultLegend") };
    }
    return { ok: false };
  }

  function transparentOn() {
    return els.bgClear.checked && !frameIsChrome();
  }

  function cardCaptionValue(payload) {
    if (selectedValue("frame") !== "card") {
      return "";
    }
    var mode = selectedValue("card-caption") || "link";
    if (mode === "none") {
      return "";
    }
    if (mode === "custom") {
      return ((els.cardCaptionText && els.cardCaptionText.value) || "").trim();
    }
    return payload.ok ? payload.caption : "";
  }

  function syncCardCaptionUi() {
    var framed = selectedValue("frame") === "card";
    var custom = framed && selectedValue("card-caption") === "custom";
    if (els.cardCaptionWrap) {
      els.cardCaptionWrap.hidden = !framed;
    }
    if (els.cardCaptionCustomWrap) {
      els.cardCaptionCustomWrap.hidden = !custom;
    }
  }

  function frameLabel() {
    var frame = selectedValue("frame");
    if (frame === "scan") {
      return t("frameScanText");
    }
    if (frame === "menu") {
      return t("frameMenuText");
    }
    return "";
  }

  function qrOptions(size) {
    var payload = currentPayload();
    return {
      text: payload.ok ? payload.url : "",
      ecc: eccLevel(),
      margin: Number(els.margin.value),
      moduleShape: selectedValue("module-shape"),
      eyeShape: selectedValue("eye-shape"),
      moduleColor: els.moduleColor.value,
      eyeColor: els.eyeColor.value,
      pupilColor: els.pupilColor.value,
      bgColor: els.bgColor.value,
      gradient: !!(els.gradientOn && els.gradientOn.checked),
      gradientTo: els.gradientTo ? els.gradientTo.value : "",
      gradientAngle: els.gradientAngle ? Number(els.gradientAngle.value) : 135,
      transparent: transparentOn(),
      frame: selectedValue("frame"),
      frameText: frameLabel(),
      size: size,
      caption: cardCaptionValue(payload),
      markSrc: markSrc(),
      markRatio: Number(els.markSize.value) / 100,
      markShape: selectedValue("mark-shape") || "rounded",
      markPadColor: els.markPadColor.value,
      markBorderColor: els.markBorderColor.value,
      markBorder: Number(els.markBorder.value) / 100,
      markPad: Number(els.markPad.value) / 100
    };
  }

  function showTypeFields() {
    document.querySelectorAll(".type-fields").forEach(function (pane) {
      var key = pane.getAttribute("data-fields");
      var on =
        key === linkType ||
        (key === "phone" && (linkType === "whatsapp" || linkType === "call"));
      pane.hidden = !on;
    });
    var leads = {
      whatsapp: t("leadWhatsapp"),
      website: t("leadWebsite"),
      email: t("leadEmail"),
      call: t("leadCall"),
      wifi: t("leadWifi"),
      nav: t("leadNav"),
      event: t("leadEvent"),
      vcard: t("leadVcard")
    };
    els.detailsLead.textContent = leads[linkType] || t("detailsDefault");
    syncExtraFields();
  }

  function syncExtraFields() {
    var coords = selectedValue("nav-mode") === "coords";
    if (els.navAddressWrap) {
      els.navAddressWrap.hidden = coords;
    }
    if (els.navCoordsWrap) {
      els.navCoordsWrap.hidden = !coords;
    }
    if (els.wifiPassWrap) {
      els.wifiPassWrap.hidden = selectedValue("wifi-auth") === "nopass";
    }
    if (els.gradientFields) {
      els.gradientFields.hidden = !(els.gradientOn && els.gradientOn.checked);
    }
  }

  function setLinkType(type, fromRestore) {
    linkType = type;
    document.querySelectorAll(".type-card").forEach(function (btn) {
      var on = btn.getAttribute("data-type") === type;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    els.typeError.textContent = "";
    if (!fromRestore) {
      var mapped = TYPE_TO_ICON[type];
      var autoIcons = {
        none: 1,
        whatsapp: 1,
        website: 1,
        email: 1,
        "message-circle": 1,
        globe: 1,
        mail: 1,
        phone: 1,
        wifi: 1,
        "map-pin": 1,
        calendar: 1,
        contact: 1,
        "brand-whatsapp": 1,
        "brand-instagram": 1,
        "brand-facebook": 1,
        "brand-linkedin": 1,
        "brand-waze": 1
      };
      if (mapped && autoIcons[iconId]) {
        setIcon(mapped);
      }
    }
    showTypeFields();
    updateNextState();
  }

  function setPhoneError(phone) {
    els.phone.setAttribute("aria-invalid", "true");
    if (!els.phone.value.trim() || phone.reason === "empty") {
      els.phoneError.textContent = t("phoneEmpty");
    } else if (phone.reason === "short") {
      els.phoneError.textContent = t("phoneShort", { min: phone.min });
    } else if (phone.reason === "long") {
      els.phoneError.textContent = t("phoneLong", { max: phone.max });
    } else {
      els.phoneError.textContent = t("phoneMobile");
    }
  }

  function detailsValid(showErrors) {
    if (linkType === "whatsapp" || linkType === "call") {
      var phone = phoneState();
      if (!phone.ok) {
        if (showErrors || els.phone.value.trim()) {
          setPhoneError(phone);
        } else {
          els.phone.removeAttribute("aria-invalid");
          els.phoneError.textContent = "";
        }
        return false;
      }
      els.phone.removeAttribute("aria-invalid");
      els.phoneError.textContent = "";
      return true;
    }
    if (linkType === "website") {
      var site = buildWebsiteUrl(els.website.value);
      if (!site.ok) {
        if (showErrors || els.website.value.trim()) {
          els.website.setAttribute("aria-invalid", "true");
          els.websiteError.textContent = site.reason === "empty" ? t("websiteEmpty") : t("websiteError");
        }
        return false;
      }
      els.website.removeAttribute("aria-invalid");
      els.websiteError.textContent = "";
      return true;
    }
    if (linkType === "email") {
      var mail = buildMailtoUrl(els.email.value, els.subject.value, els.body.value);
      if (!mail.ok) {
        if (showErrors || els.email.value.trim()) {
          els.email.setAttribute("aria-invalid", "true");
          els.emailError.textContent = mail.reason === "empty" ? t("emailEmpty") : t("emailError");
        }
        return false;
      }
      els.email.removeAttribute("aria-invalid");
      els.emailError.textContent = "";
      return true;
    }
    if (linkType === "wifi") {
      var wifi = buildWifiPayload(els.wifiSsid.value, selectedValue("wifi-auth"), els.wifiPass.value, els.wifiHidden.checked);
      els.wifiSsid.removeAttribute("aria-invalid");
      els.wifiPass.removeAttribute("aria-invalid");
      els.wifiError.textContent = "";
      els.wifiPassError.textContent = "";
      if (wifi.ok) {
        return true;
      }
      if (showErrors || els.wifiSsid.value.trim() || els.wifiPass.value.trim()) {
        if (wifi.reason === "password") {
          els.wifiPass.setAttribute("aria-invalid", "true");
          els.wifiPassError.textContent = t("wifiPassEmpty");
        } else {
          els.wifiSsid.setAttribute("aria-invalid", "true");
          els.wifiError.textContent = t("wifiEmpty");
        }
      }
      return false;
    }
    if (linkType === "nav") {
      var nav = buildNavUrl(selectedValue("nav-provider"), selectedValue("nav-mode"), els.navQuery.value, els.navLat.value, els.navLng.value);
      els.navQuery.removeAttribute("aria-invalid");
      els.navError.textContent = "";
      if (nav.ok) {
        return true;
      }
      if (showErrors || els.navQuery.value.trim() || els.navLat.value.trim() || els.navLng.value.trim()) {
        els.navQuery.setAttribute("aria-invalid", "true");
        els.navError.textContent = nav.reason === "coords" ? t("navCoordsError") : t("navEmpty");
      }
      return false;
    }
    if (linkType === "event") {
      var eventCard = buildVEvent(els.eventTitle.value, els.eventStart.value, els.eventEnd.value, els.eventPlace.value);
      els.eventTitle.removeAttribute("aria-invalid");
      els.eventStart.removeAttribute("aria-invalid");
      els.eventError.textContent = "";
      if (eventCard.ok) {
        return true;
      }
      if (showErrors || els.eventTitle.value.trim() || els.eventStart.value) {
        if (eventCard.reason === "start") {
          els.eventStart.setAttribute("aria-invalid", "true");
          els.eventError.textContent = t("eventStartError");
        } else {
          els.eventTitle.setAttribute("aria-invalid", "true");
          els.eventError.textContent = t("eventEmpty");
        }
      }
      return false;
    }
    if (linkType === "vcard") {
      var card = buildVCard(els.vcardName.value, els.vcardPhone.value, els.vcardEmail.value, els.vcardUrl.value, els.vcardOrg.value);
      els.vcardName.removeAttribute("aria-invalid");
      els.vcardEmail.removeAttribute("aria-invalid");
      els.vcardUrl.removeAttribute("aria-invalid");
      els.vcardError.textContent = "";
      if (card.ok) {
        return true;
      }
      if (showErrors || els.vcardName.value.trim() || els.vcardEmail.value.trim() || els.vcardUrl.value.trim()) {
        if (card.reason === "email") {
          els.vcardEmail.setAttribute("aria-invalid", "true");
          els.vcardError.textContent = t("vcardEmailError");
        } else if (card.reason === "url") {
          els.vcardUrl.setAttribute("aria-invalid", "true");
          els.vcardError.textContent = t("vcardUrlError");
        } else {
          els.vcardName.setAttribute("aria-invalid", "true");
          els.vcardError.textContent = t("vcardEmpty");
        }
      }
      return false;
    }
    return false;
  }

  function updateNextState() {
    if (step === 0) {
      els.next.disabled = !linkType;
    } else if (step === 1) {
      els.next.disabled = !detailsValid(false);
    } else {
      els.next.disabled = false;
    }
    els.next.hidden = step === 3;
    els.back.disabled = step === 0;
  }

  function goTo(next) {
    if (next > step) {
      if (step === 0 && !linkType) {
        els.typeError.textContent = t("typeError");
        return;
      }
      if (step === 1 && !detailsValid(true)) {
        return;
      }
    }
    if (next > 0 && !linkType) {
      return;
    }
    if (next > 1 && !detailsValid(true)) {
      return;
    }
    step = Math.max(0, Math.min(3, next));
    reached = Math.max(reached, step);
    document.querySelectorAll(".step-pane").forEach(function (pane) {
      var on = Number(pane.getAttribute("data-step")) === step;
      pane.hidden = !on;
      pane.classList.toggle("is-on", on);
    });
    document.querySelectorAll(".step-btn").forEach(function (btn) {
      var n = Number(btn.getAttribute("data-go"));
      btn.classList.toggle("is-current", n === step);
      btn.classList.toggle("is-done", n < step);
      btn.disabled = n > reached;
      if (n === step) {
        btn.setAttribute("aria-current", "step");
      } else {
        btn.removeAttribute("aria-current");
      }
    });
    els.workspace.classList.toggle("is-start", step === 0);
    els.previewCol.hidden = step === 0;
    if (els.downloadActions) {
      els.downloadActions.hidden = step !== 3;
    }
    updateNextState();
    renderPreview();
    revealActiveStep();
    schedulePersist();
    syncWizardHistory();
  }

  /* Device/browser Back moves one wizard step, then leaves the page from step 0. */
  function armWizardHistory() {
    if (handlingPop || historyArmed || step < 1) {
      return;
    }
    try {
      history.pushState({ arichWizard: true, step: step }, "", window.location.href);
      historyArmed = true;
    } catch (err) {}
  }

  function consumeWizardHistory() {
    if (!historyArmed || handlingPop) {
      historyArmed = false;
      return;
    }
    historyArmed = false;
    handlingPop = true;
    try {
      history.back();
    } catch (err) {
      handlingPop = false;
    }
    window.setTimeout(function () {
      handlingPop = false;
    }, 300);
  }

  function syncWizardHistory() {
    if (handlingPop) {
      return;
    }
    if (step > 0) {
      armWizardHistory();
    } else {
      consumeWizardHistory();
    }
  }

  function onWizardPopState() {
    if (handlingPop) {
      handlingPop = false;
      historyArmed = false;
      return;
    }
    historyArmed = false;
    if (els.shareModal && !els.shareModal.hidden) {
      closeShareModal();
      armWizardHistory();
      return;
    }
    if (step > 0) {
      handlingPop = true;
      goTo(step - 1);
      handlingPop = false;
      armWizardHistory();
    }
  }

  function compactLayout() {
    return window.matchMedia("(max-width: 1200px)").matches;
  }

  function revealActiveStep() {
    var pane = document.querySelector(".step-pane.is-on");
    if (!pane) {
      return;
    }
    if (compactLayout()) {
      if (step === 0) {
        return;
      }
      var heading = pane.querySelector("h2") || pane;
      heading.scrollIntoView({ block: "start", behavior: "auto" });
      return;
    }
    if (step === 0) {
      return;
    }
    var first = pane.querySelector(
      "input:not([type='hidden']):not([type='file']):not([type='radio']):not([type='checkbox']), textarea, select"
    );
    if (first) {
      first.focus();
    }
  }

  function applyPreset(name) {
    var preset = QR_PRESETS[name];
    if (!preset) {
      return;
    }
    setRadio("module-shape", preset.moduleShape);
    setRadio("eye-shape", preset.eyeShape);
    els.moduleColor.value = preset.moduleColor;
    els.eyeColor.value = preset.eyeColor;
    els.pupilColor.value = preset.pupilColor || preset.eyeColor;
    els.bgColor.value = preset.bgColor;
    setRadio("frame", preset.frame);
    if (preset.frame === "card") {
      els.bgClear.checked = false;
    }
    setRadio("mark-shape", preset.markShape || "rounded");
    els.markPadColor.value = preset.markPadColor || "#ffffff";
    els.markBorderColor.value = preset.markBorderColor || "#111111";
    els.markBorder.value = preset.markBorder != null ? String(preset.markBorder) : "0";
    els.markBorderVal.textContent = els.markBorder.value + "%";
    els.markPad.value = preset.markPad != null ? String(preset.markPad) : "18";
    els.markPadVal.textContent = els.markPad.value + "%";
    els.markSize.value = preset.markSize != null ? String(preset.markSize) : "20";
    els.markSizeVal.textContent = els.markSize.value + "%";
    els.iconColor.value = preset.iconColor || "#111111";
    if (els.gradientOn) {
      els.gradientOn.checked = !!preset.gradient;
    }
    if (els.gradientTo && preset.gradientTo) {
      els.gradientTo.value = preset.gradientTo;
    }
    if (els.gradientAngle && preset.gradientAngle != null) {
      els.gradientAngle.value = String(preset.gradientAngle);
      els.gradientAngleVal.textContent = preset.gradientAngle + "°";
    }
    syncExtraFields();
    if (iconId !== "upload") {
      setIcon(preset.icon || TYPE_TO_ICON[linkType] || "globe");
    }
    document.querySelectorAll(".preset").forEach(function (btn) {
      var on = btn.getAttribute("data-preset") === name;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    syncAllColorFields();
  }

  function clearPresetSelection() {
    document.querySelectorAll(".preset").forEach(function (btn) {
      btn.classList.remove("is-on");
      btn.setAttribute("aria-pressed", "false");
    });
  }

  function escHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderContext(payload) {
    if (!payload.ok) {
      els.context.innerHTML = "";
      return;
    }
    if (linkType === "whatsapp") {
      var text = els.message.value.trim();
      els.context.innerHTML =
        '<div class="chat-preview"><div class="chat-preview-label">' + escHtml(t("chatLabel")) + "</div>" +
        '<div class="bubble' + (text ? "" : " is-blank") + '">' +
        escHtml(text || t("chatEmpty")) +
        "</div></div>";
      return;
    }
    els.context.innerHTML =
      '<div class="context-box"><strong>' +
      escHtml(payload.captionSub) +
      '</strong><span class="context-caption" dir="auto">' +
      escHtml(payload.caption) +
      "</span></div>";
  }

  function renderPreview() {
    if (els.message) {
      els.count.textContent = els.message.value.length + " / " + MESSAGE_MAX;
    }
    document.querySelectorAll("[data-template]").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-template") === els.message.value);
    });

    var framed = frameIsChrome();
    syncCardCaptionUi();
    syncExtraFields();
    els.bgClear.disabled = framed;
    document.querySelectorAll('input[name="png-bg"]').forEach(function (input) {
      input.disabled = framed && input.value === "clear";
    });
    setRadio("png-bg", !framed && els.bgClear.checked ? "clear" : "solid");
    els.clearNote.textContent = framed ? t("cardOpaque") : "";
    els.qrMount.classList.toggle("is-clear", transparentOn());
    if (els.eccNote) {
      els.eccNote.textContent = markSrc() && eccLevel() === "L" ? t("eccLowNote") : "";
    }

    var compareBg = transparentOn() ? "#ffffff" : els.bgColor.value;
    var ink = els.moduleColor.value;
    if (els.gradientOn && els.gradientOn.checked && els.gradientTo && relativeLuminance(els.gradientTo.value) > relativeLuminance(ink)) {
      ink = els.gradientTo.value;
    }
    var lowContrast = contrastRatio(ink, compareBg) < 3;
    els.contrastNote.textContent = lowContrast ? t("contrastNote") : "";
    if (els.downloadContrast) {
      els.downloadContrast.textContent = lowContrast ? t("contrastNote") : "";
    }
    if (els.designCode) {
      els.designCode.value = encodeDesignCode(currentDesign());
    }

    var payload = currentPayload();
    var ready = payload.ok;
    els.png.disabled = !ready;
    els.svg.disabled = !ready;
    if (els.copyImg) {
      els.copyImg.disabled = !ready;
    }
    if (els.copyLink) {
      els.copyLink.disabled = !ready;
    }
    els.link.textContent = ready ? readableText(payload.url) : "—";
    els.linkLive.textContent = ready ? t("linkUpdated") : "";
    var openable = ready && /^(https?:|mailto:|tel:)/i.test(payload.url);
    els.open.classList.toggle("is-ready", openable);
    if (openable) {
      els.open.setAttribute("href", payload.url);
      els.open.setAttribute("aria-disabled", "false");
      els.open.setAttribute("aria-label", payload.openLabel || t("open"));
      els.open.removeAttribute("tabindex");
    } else {
      els.open.removeAttribute("href");
      els.open.setAttribute("aria-disabled", "true");
      els.open.setAttribute("tabindex", "-1");
      els.open.setAttribute("aria-label", t("resultLegend"));
    }
    renderContext(payload);

    if (step === 0) {
      return;
    }

    if (!ready) {
      els.qrMount.innerHTML =
        '<div class="qr-empty"><strong>' + t("waitingTitle") + "</strong>" + t("waitingLead") + "</div>";
      return;
    }

    var svg = renderQrSvg(qrOptions(640));
    if (!svg) {
      els.qrMount.innerHTML = "";
      els.renderError.textContent = t("tooLong");
      els.png.disabled = true;
      els.svg.disabled = true;
      if (els.copyImg) {
        els.copyImg.disabled = true;
      }
      return;
    }
    els.renderError.textContent = "";
    els.qrMount.innerHTML = svg.replace('<?xml version="1.0" encoding="UTF-8"?>', "");
    updateNextState();
  }

  function currentDesign() {
    return {
      v: 1,
      moduleShape: selectedValue("module-shape") || "square",
      eyeShape: selectedValue("eye-shape") || "square",
      moduleColor: els.moduleColor.value,
      eyeColor: els.eyeColor.value,
      pupilColor: els.pupilColor.value,
      bgColor: els.bgColor.value,
      bgClear: !!els.bgClear.checked,
      margin: Number(els.margin.value),
      gradient: !!(els.gradientOn && els.gradientOn.checked),
      gradientTo: els.gradientTo ? els.gradientTo.value : "#2563EB",
      gradientAngle: els.gradientAngle ? Number(els.gradientAngle.value) : 135,
      iconId: iconId === "upload" ? "none" : iconId,
      markShape: selectedValue("mark-shape") || "rounded",
      markPadColor: els.markPadColor.value,
      markBorderColor: els.markBorderColor.value,
      markBorder: Number(els.markBorder.value),
      markPad: Number(els.markPad.value),
      markSize: Number(els.markSize.value),
      iconColor: els.iconColor.value,
      frame: selectedValue("frame") || "plain",
      ecc: selectedValue("ecc-level") || "auto",
      cardCaption: selectedValue("card-caption") || "link"
    };
  }

  function applyDesign(data) {
    if (!data) {
      return false;
    }
    if (data.moduleShape) {
      setRadio("module-shape", data.moduleShape);
    }
    if (data.eyeShape) {
      setRadio("eye-shape", data.eyeShape);
    }
    if (data.moduleColor) {
      els.moduleColor.value = data.moduleColor;
    }
    if (data.eyeColor) {
      els.eyeColor.value = data.eyeColor;
    }
    if (data.pupilColor) {
      els.pupilColor.value = data.pupilColor;
    }
    if (data.bgColor) {
      els.bgColor.value = data.bgColor;
    }
    els.bgClear.checked = !!data.bgClear;
    if (data.margin != null) {
      els.margin.value = String(data.margin);
      els.marginVal.textContent = String(data.margin);
    }
    if (els.gradientOn) {
      els.gradientOn.checked = !!data.gradient;
    }
    if (els.gradientTo && data.gradientTo) {
      els.gradientTo.value = data.gradientTo;
    }
    if (els.gradientAngle && data.gradientAngle != null) {
      els.gradientAngle.value = String(data.gradientAngle);
      els.gradientAngleVal.textContent = data.gradientAngle + "°";
    }
    if (data.markShape) {
      setRadio("mark-shape", data.markShape);
    }
    if (data.markPadColor) {
      els.markPadColor.value = data.markPadColor;
    }
    if (data.markBorderColor) {
      els.markBorderColor.value = data.markBorderColor;
    }
    if (data.markBorder != null) {
      els.markBorder.value = String(data.markBorder);
      els.markBorderVal.textContent = data.markBorder + "%";
    }
    if (data.markPad != null) {
      els.markPad.value = String(data.markPad);
      els.markPadVal.textContent = data.markPad + "%";
    }
    if (data.markSize != null) {
      els.markSize.value = String(data.markSize);
      els.markSizeVal.textContent = data.markSize + "%";
    }
    if (data.iconColor) {
      els.iconColor.value = data.iconColor;
    }
    if (data.frame) {
      setRadio("frame", data.frame);
    }
    if (data.ecc) {
      setRadio("ecc-level", data.ecc);
    }
    if (data.cardCaption) {
      setRadio("card-caption", data.cardCaption);
    }
    clearPresetSelection();
    if (data.iconId && data.iconId !== "upload") {
      setIcon(data.iconId);
    }
    syncAllColorFields();
    syncExtraFields();
    return true;
  }

  function renderSavedDesigns() {
    if (!els.savedDesigns) {
      return;
    }
    var list = readSavedDesigns();
    els.savedDesigns.innerHTML = "";
    if (!list.length) {
      els.savedDesigns.hidden = true;
      return;
    }
    els.savedDesigns.hidden = false;
    var title = document.createElement("p");
    title.className = "legend";
    title.textContent = t("savedDesigns");
    els.savedDesigns.appendChild(title);
    list.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "saved-row";
      var apply = document.createElement("button");
      apply.type = "button";
      apply.className = "btn btn-ghost";
      apply.textContent = item.name || t("designCodeApply");
      apply.addEventListener("click", function () {
        var parsed = decodeDesignCode(item.code);
        if (!applyDesign(parsed)) {
          return;
        }
        renderPreview();
        schedulePersist();
      });
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-ghost";
      remove.textContent = t("deleteDesign");
      remove.addEventListener("click", function () {
        forgetDesign(item.id);
        renderSavedDesigns();
      });
      row.appendChild(apply);
      row.appendChild(remove);
      els.savedDesigns.appendChild(row);
    });
  }

  function collectState() {
    return {
      step: step,
      reached: reached,
      linkType: linkType,
      dial: els.dial.value,
      phone: els.phone.value,
      message: els.message.value,
      website: els.website.value,
      email: els.email.value,
      subject: els.subject.value,
      body: els.body.value,
      iconId: iconId,
      uploadedMark: uploadedMark.length < MAX_PERSIST_MARK ? uploadedMark : "",
      markShape: selectedValue("mark-shape"),
      markPadColor: els.markPadColor.value,
      markBorderColor: els.markBorderColor.value,
      markBorder: els.markBorder.value,
      markPad: els.markPad.value,
      iconColor: els.iconColor.value,
      markSize: els.markSize.value,
      moduleShape: selectedValue("module-shape"),
      eyeShape: selectedValue("eye-shape"),
      moduleColor: els.moduleColor.value,
      eyeColor: els.eyeColor.value,
      pupilColor: els.pupilColor.value,
      bgColor: els.bgColor.value,
      bgClear: els.bgClear.checked,
      margin: els.margin.value,
      pngSize: selectedValue("png-size"),
      frame: selectedValue("frame"),
      cardCaption: selectedValue("card-caption") || "link",
      cardCaptionText: els.cardCaptionText ? els.cardCaptionText.value : "",
      wifiSsid: els.wifiSsid ? els.wifiSsid.value : "",
      wifiAuth: selectedValue("wifi-auth"),
      wifiPass: els.wifiPass ? els.wifiPass.value : "",
      wifiHidden: !!(els.wifiHidden && els.wifiHidden.checked),
      navProvider: selectedValue("nav-provider"),
      navMode: selectedValue("nav-mode"),
      navQuery: els.navQuery ? els.navQuery.value : "",
      navLat: els.navLat ? els.navLat.value : "",
      navLng: els.navLng ? els.navLng.value : "",
      eventTitle: els.eventTitle ? els.eventTitle.value : "",
      eventStart: els.eventStart ? els.eventStart.value : "",
      eventEnd: els.eventEnd ? els.eventEnd.value : "",
      eventPlace: els.eventPlace ? els.eventPlace.value : "",
      vcardName: els.vcardName ? els.vcardName.value : "",
      vcardPhone: els.vcardPhone ? els.vcardPhone.value : "",
      vcardEmail: els.vcardEmail ? els.vcardEmail.value : "",
      vcardUrl: els.vcardUrl ? els.vcardUrl.value : "",
      vcardOrg: els.vcardOrg ? els.vcardOrg.value : "",
      gradient: !!(els.gradientOn && els.gradientOn.checked),
      gradientTo: els.gradientTo ? els.gradientTo.value : "",
      gradientAngle: els.gradientAngle ? els.gradientAngle.value : "135",
      ecc: selectedValue("ecc-level") || "auto",
      preset: document.querySelector(".preset.is-on") ? document.querySelector(".preset.is-on").getAttribute("data-preset") : "custom"
    };
  }

  /* Draft stays in this browser only. Quota errors are non-fatal. */
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collectState()));
    } catch (err) {
      try {
        var fallback = collectState();
        fallback.uploadedMark = "";
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
      } catch (ignored) {}
    }
  }

  function schedulePersist() {
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(persist, 250);
  }

  /* Older drafts stored A.RICH chrome colors on the QR itself. */
  function isRetiredBrandColor(hex) {
    var value = String(hex || "").toLowerCase();
    return value === "#005f60" || value === "#38c6ba" || value === "#c2410c";
  }

  function restore() {
    applyPreset("print");
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      var data = JSON.parse(raw);
      if (data.dial) {
        els.dial.value = data.dial;
      }
      ["phone", "message", "website", "email", "subject", "body", "wifiSsid", "wifiPass", "navQuery", "navLat", "navLng", "eventTitle", "eventStart", "eventEnd", "eventPlace", "vcardName", "vcardPhone", "vcardEmail", "vcardUrl", "vcardOrg"].forEach(function (key) {
        if (typeof data[key] === "string" && els[key]) {
          if (key === "phone" && isRetiredDemoPhone(data[key])) {
            els[key].value = "";
          } else {
            els[key].value = data[key];
          }
        }
      });
      if (data.preset && QR_PRESETS[data.preset]) {
        applyPreset(data.preset);
      } else if (data.preset === "arich" || data.preset === "copper" || data.preset === "dark") {
        applyPreset("print");
      }
      if (data.moduleShape) {
        setRadio("module-shape", data.moduleShape);
      }
      if (data.eyeShape) {
        setRadio("eye-shape", data.eyeShape);
      }
      if (data.moduleColor && !isRetiredBrandColor(data.moduleColor)) {
        els.moduleColor.value = data.moduleColor;
      }
      if (data.eyeColor && !isRetiredBrandColor(data.eyeColor)) {
        els.eyeColor.value = data.eyeColor;
      }
      if (data.pupilColor && !isRetiredBrandColor(data.pupilColor)) {
        els.pupilColor.value = data.pupilColor;
      }
      if (data.bgColor) {
        els.bgColor.value = data.bgColor;
      }
      els.bgClear.checked = !!data.bgClear;
      if (data.margin) {
        els.margin.value = data.margin;
        els.marginVal.textContent = data.margin;
      }
      if (data.markShape) {
        setRadio("mark-shape", data.markShape);
      }
      if (data.markPadColor && !isRetiredBrandColor(data.markPadColor)) {
        els.markPadColor.value = data.markPadColor;
      } else if (data.markPadColor) {
        els.markPadColor.value = "#ffffff";
      }
      if (data.markBorderColor && !isRetiredBrandColor(data.markBorderColor)) {
        els.markBorderColor.value = data.markBorderColor;
      }
      if (data.markBorder != null) {
        els.markBorder.value = data.markBorder;
        els.markBorderVal.textContent = data.markBorder + "%";
      }
      if (data.markPad != null) {
        els.markPad.value = data.markPad;
        els.markPadVal.textContent = data.markPad + "%";
      }
      if (data.iconColor && !isRetiredBrandColor(data.iconColor)) {
        els.iconColor.value = data.iconColor;
      }
      if (data.markSize) {
        els.markSize.value = data.markSize;
        els.markSizeVal.textContent = data.markSize + "%";
      }
      if (data.pngSize) {
        setRadio("png-size", String(data.pngSize));
      }
      if (data.wifiAuth) {
        setRadio("wifi-auth", data.wifiAuth);
      }
      if (els.wifiHidden) {
        els.wifiHidden.checked = !!data.wifiHidden;
      }
      if (data.navProvider) {
        setRadio("nav-provider", data.navProvider);
      }
      if (data.navMode) {
        setRadio("nav-mode", data.navMode);
      }
      if (data.gradientTo && els.gradientTo) {
        els.gradientTo.value = data.gradientTo;
      }
      if (data.gradientAngle && els.gradientAngle) {
        els.gradientAngle.value = data.gradientAngle;
        els.gradientAngleVal.textContent = data.gradientAngle + "°";
      }
      if (els.gradientOn) {
        els.gradientOn.checked = !!data.gradient;
      }
      if (data.ecc) {
        setRadio("ecc-level", data.ecc);
      }
      if (data.frame) {
        setRadio("frame", data.frame);
      }
      if (data.cardCaption) {
        setRadio("card-caption", data.cardCaption);
      }
      if (data.cardCaptionText && els.cardCaptionText) {
        els.cardCaptionText.value = data.cardCaptionText;
      }
      if (data.uploadedMark) {
        uploadedMark = data.uploadedMark;
        els.uploadPreview.src = uploadedMark;
        els.uploadPreview.hidden = false;
      }
      var keepIcon = data.iconId && data.iconId !== "arich";
      if (keepIcon) {
        setIcon(data.iconId);
      }
      if (uploadedMark && iconId === "upload") {
        extractLogoPalette(uploadedMark).then(function (palette) {
          if (!palette) {
            return;
          }
          fillLogoPaletteChips(palette.colors);
          appendLogoSwatches(palette.colors);
        });
      }
      if (data.linkType) {
        setLinkType(data.linkType, keepIcon);
      }
      reached = Number(data.reached) || 0;
      if (data.step) {
        goTo(Number(data.step) || 0);
      }
    } catch (err) {
      applyPreset("print");
    }
  }

  function waitFonts() {
    if (document.fonts && document.fonts.ready) {
      return document.fonts.ready.catch(function () {
        return null;
      });
    }
    return Promise.resolve();
  }

  function copyImage() {
    var opts = qrOptions(1024);
    if (!opts.text) {
      return;
    }
    waitFonts()
      .then(function () {
        return loadMarkImage(opts.markSrc);
      })
      .then(function (img) {
        var canvas = document.createElement("canvas");
        if (!drawQrToCanvas(canvas, opts, img)) {
          els.renderError.textContent = t("exportFail");
          return;
        }
        canvas.toBlob(function (blob) {
          if (!blob || !navigator.clipboard || typeof ClipboardItem === "undefined") {
            els.renderError.textContent = t("copyImageFail");
            return;
          }
          navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(function () {
            els.renderError.textContent = t("copyImageOk");
          }).catch(function () {
            els.renderError.textContent = t("copyImageFail");
          });
        }, "image/png");
      });
  }

  function showInAppBanner() {
    if (!els.inappBanner) {
      return;
    }
    var ua = navigator.userAgent || "";
    var inApp = ua.indexOf("FBAN") !== -1 || ua.indexOf("FBAV") !== -1 || ua.indexOf("FB_IAB") !== -1 || ua.indexOf("Instagram") !== -1;
    var dismissed = false;
    try {
      dismissed = sessionStorage.getItem("arich-inapp-dismissed") === "1";
    } catch (err) {}
    els.inappBanner.hidden = !inApp || dismissed;
  }

  function exportPng() {
    var opts = qrOptions(Number(selectedValue("png-size") || 1024));
    if (!opts.text) {
      return;
    }
    waitFonts()
      .then(function () {
        return loadMarkImage(opts.markSrc);
      })
      .then(function (img) {
        var canvas = document.createElement("canvas");
        var layout = drawQrToCanvas(canvas, opts, img);
        if (!layout) {
          els.renderError.textContent = t("exportFail");
          return;
        }
        canvas.toBlob(function (blob) {
          if (blob) {
            downloadFile(blob, "qr-code.png");
            offerShareModal();
          }
        }, "image/png");
      });
  }

  var ALLOWED_IMAGE_TYPES = {
    "image/png": 1,
    "image/jpeg": 1,
    "image/jpg": 1,
    "image/svg+xml": 1,
    "image/webp": 1
  };

  function isAllowedImage(file) {
    var type = String(file.type || "").toLowerCase();
    var name = String(file.name || "");
    if (ALLOWED_IMAGE_TYPES[type]) {
      return true;
    }
    if (!/\.(png|jpe?g|svg|webp)$/i.test(name)) {
      return false;
    }
    return !type || type.indexOf("image/") === 0 || type === "application/octet-stream";
  }

  function setFileError(key) {
    if (els.fileError) {
      els.fileError.textContent = key ? t(key) : "";
    }
    if (els.dropZone) {
      els.dropZone.classList.toggle("has-error", !!key);
    }
  }

  function onFile(file) {
    if (!file) {
      return;
    }
    setFileError("");
    if (file.size > MAX_UPLOAD_BYTES) {
      setFileError("fileTooBig");
      els.file.value = "";
      return;
    }
    if (!isAllowedImage(file)) {
      setFileError("fileType");
      els.file.value = "";
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () {
      setFileError("fileInvalid");
      els.file.value = "";
    };
    reader.onload = function () {
      var src = String(reader.result || "");
      if (!src) {
        setFileError("fileInvalid");
        els.file.value = "";
        return;
      }
      var img = new Image();
      img.onload = function () {
        uploadedMark = src;
        els.uploadPreview.src = uploadedMark;
        els.uploadPreview.hidden = false;
        setIcon("upload");
        extractLogoPalette(uploadedMark).then(function (palette) {
          if (palette) {
            applyLogoPalette(palette);
          } else {
            fillLogoPaletteChips([]);
            appendLogoSwatches([]);
          }
          renderPreview();
          schedulePersist();
        });
        renderPreview();
        schedulePersist();
        els.file.value = "";
      };
      img.onerror = function () {
        setFileError("fileInvalid");
        els.file.value = "";
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  /* Public page URL for social share. Facebook and LinkedIn reject file:// and empty href. */
  var PUBLIC_SITE_URL = "https://a-rich-software.github.io/qr-code-wizard";

  function withoutTrailingSlash(url) {
    return String(url || "").replace(/\/+$/, "");
  }

  function pageShareUrl() {
    var page = new URL(window.location.href);
    page.hash = "";
    page.search = "";
    if (/index\.html$/i.test(page.pathname)) {
      page.pathname = page.pathname.replace(/index\.html$/i, "");
    }
    if (page.hostname === "localhost" || page.hostname === "127.0.0.1" || page.protocol === "file:") {
      return PUBLIC_SITE_URL;
    }
    if (page.protocol === "http:" || page.protocol === "https:") {
      return withoutTrailingSlash(page.href);
    }
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href && /^https?:/i.test(canonical.href)) {
      return withoutTrailingSlash(canonical.href);
    }
    return PUBLIC_SITE_URL;
  }

  function shareMessage() {
    return t("shareBody") + "\n\n" + pageShareUrl();
  }

  function fillShareLinks() {
    var url = pageShareUrl();
    var text = shareMessage();
    var encodedUrl = encodeURIComponent(url);
    if (els.shareFacebook) {
      els.shareFacebook.href =
        "https://www.facebook.com/sharer.php?u=" + encodedUrl + "&href=" + encodedUrl;
    }
    if (els.shareWhatsapp) {
      els.shareWhatsapp.href = "https://wa.me/?text=" + encodeURIComponent(text);
    }
    if (els.shareLinkedin) {
      els.shareLinkedin.href =
        "https://www.linkedin.com/feed/?shareActive=true&text=" + encodeURIComponent(text);
    }
  }

  function shareWasDismissed() {
    try {
      return sessionStorage.getItem(SHARE_KEY) === "1";
    } catch (err) {
      return false;
    }
  }

  function markShareDismissed() {
    try {
      sessionStorage.setItem(SHARE_KEY, "1");
    } catch (err) {}
  }

  function openShareModal() {
    if (!els.shareModal || shareWasDismissed()) {
      return;
    }
    fillShareLinks();
    lastFocused = document.activeElement;
    els.shareModal.hidden = false;
    if (els.shareStatus) {
      els.shareStatus.hidden = true;
      els.shareStatus.textContent = "";
    }
    var closeBtn = els.shareModal.querySelector(".share-close");
    if (closeBtn) {
      closeBtn.focus();
    }
  }

  function closeShareModal() {
    if (!els.shareModal || els.shareModal.hidden) {
      return;
    }
    els.shareModal.hidden = true;
    markShareDismissed();
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  function offerShareModal() {
    window.setTimeout(openShareModal, 400);
  }

  function bind() {
    document.querySelectorAll(".type-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setLinkType(btn.getAttribute("data-type"), false);
        goTo(1);
      });
    });

    document.querySelectorAll(".step-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        goTo(Number(btn.getAttribute("data-go")));
      });
    });

    els.next.addEventListener("click", function () {
      goTo(step + 1);
    });
    els.back.addEventListener("click", function () {
      if (historyArmed && step > 0) {
        history.back();
        return;
      }
      goTo(step - 1);
    });
    window.addEventListener("popstate", onWizardPopState);

    ["input", "change"].forEach(function (evt) {
      els.form.addEventListener(evt, function (event) {
        var target = event.target;
        if (
          target &&
          (target.name === "module-shape" ||
            target.name === "eye-shape" ||
            target.id === "module-color" ||
            target.id === "eye-color" ||
            target.id === "pupil-color" ||
            target.id === "bg-color" ||
            target.name === "frame")
        ) {
          clearPresetSelection();
        }
        if (target && target.classList && target.classList.contains("color-hex")) {
          var hexPicker = target.closest(".color-field").querySelector("input[type='color']");
          if (setColorValue(hexPicker, target.value, false)) {
            target.removeAttribute("aria-invalid");
            setColorCodeError(target, "");
          } else if (target.value.trim()) {
            target.setAttribute("aria-invalid", "true");
            setColorCodeError(target, "colorHexError");
          } else {
            target.removeAttribute("aria-invalid");
            setColorCodeError(target, "");
          }
        }
        if (target && target.classList && target.classList.contains("color-rgb")) {
          var rgbPicker = target.closest(".color-field").querySelector("input[type='color']");
          var fromRgb = parseRgb(target.value);
          if (fromRgb && setColorValue(rgbPicker, fromRgb, false)) {
            target.removeAttribute("aria-invalid");
            setColorCodeError(target, "");
          } else if (target.value.trim()) {
            target.setAttribute("aria-invalid", "true");
            setColorCodeError(target, "colorRgbError");
          } else {
            target.removeAttribute("aria-invalid");
            setColorCodeError(target, "");
          }
        }
        if (target && target.type === "color") {
          syncColorFields(target);
        }
        if (target === els.dial) {
          els.phone.placeholder = phonePlaceholder(els.dial.value);
        }
        if (target === els.margin) {
          els.marginVal.textContent = els.margin.value;
        }
        if (target === els.markSize) {
          els.markSizeVal.textContent = els.markSize.value + "%";
        }
        if (target === els.markBorder) {
          els.markBorderVal.textContent = els.markBorder.value + "%";
        }
        if (target === els.markPad) {
          els.markPadVal.textContent = els.markPad.value + "%";
        }
        if (target === els.bgClear) {
          setRadio("png-bg", els.bgClear.checked ? "clear" : "solid");
          if (els.bgClear.checked) {
            setRadio("frame", "plain");
          }
        }
        if (target && target.name === "png-bg") {
          els.bgClear.checked = selectedValue("png-bg") === "clear";
          if (els.bgClear.checked) {
            setRadio("frame", "plain");
          }
        }
        if (target && target.name === "frame" && frameIsChrome()) {
          els.bgClear.checked = false;
          setRadio("png-bg", "solid");
        }
        if (target === els.gradientAngle && els.gradientAngleVal) {
          els.gradientAngleVal.textContent = els.gradientAngle.value + "°";
        }
        detailsValid(false);
        renderPreview();
        updateNextState();
        schedulePersist();
      });
    });

    document.querySelectorAll(".preset").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyPreset(btn.getAttribute("data-preset"));
        renderPreview();
        schedulePersist();
      });
    });

    document.querySelectorAll("[data-template]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        els.message.value = btn.getAttribute("data-template");
        renderPreview();
        schedulePersist();
      });
    });

    els.png.addEventListener("click", function () {
      exportPng();
    });
    els.svg.addEventListener("click", function () {
      var svg = renderQrSvg(qrOptions(1024));
      if (svg) {
        downloadFile(new Blob([svg], { type: "image/svg+xml" }), "qr-code.svg");
        offerShareModal();
      }
    });
    if (els.copyImg) {
      els.copyImg.addEventListener("click", copyImage);
    }
    if (els.copyLink) {
      els.copyLink.addEventListener("click", function () {
        var payload = currentPayload();
        if (!payload.ok) {
          return;
        }
        copyText(readableText(payload.url)).then(function () {
          els.copyLink.textContent = t("copied");
          window.setTimeout(function () {
            els.copyLink.textContent = t("copy");
          }, 1400);
        });
      });
    }
    if (els.copyDesign) {
      els.copyDesign.addEventListener("click", function () {
        copyText(els.designCode.value).then(function () {
          els.copyDesign.textContent = t("copied");
          window.setTimeout(function () {
            els.copyDesign.textContent = t("designCodeCopy");
          }, 1400);
        });
      });
    }
    if (els.applyDesignBtn) {
      els.applyDesignBtn.addEventListener("click", function () {
        var parsed = decodeDesignCode(els.designPaste.value);
        if (!parsed) {
          els.designPasteError.textContent = t("designCodeBad");
          return;
        }
        els.designPasteError.textContent = "";
        applyDesign(parsed);
        renderPreview();
        schedulePersist();
      });
    }
    if (els.saveDesign) {
      els.saveDesign.addEventListener("click", function () {
        els.saveDesignWrap.hidden = false;
        if (els.saveDesignName) {
          els.saveDesignName.focus();
        }
      });
    }
    if (els.saveDesignConfirm) {
      els.saveDesignConfirm.addEventListener("click", function () {
        var name = (els.saveDesignName.value || "").trim() || t("saveDesign");
        try {
          rememberDesign(name, els.designCode.value);
          els.saveStatus.textContent = t("saveDesignDone");
          els.saveDesignWrap.hidden = true;
          els.saveDesignName.value = "";
          renderSavedDesigns();
        } catch (err) {
          els.saveStatus.textContent = "";
        }
      });
    }
    if (els.previewToggle) {
      els.previewToggle.addEventListener("click", function () {
        var open = !els.previewCol.classList.contains("is-open");
        els.previewCol.classList.toggle("is-open", open);
        els.previewToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    if (els.inappClose) {
      els.inappClose.addEventListener("click", function () {
        els.inappBanner.hidden = true;
        try {
          sessionStorage.setItem("arich-inapp-dismissed", "1");
        } catch (err) {}
      });
    }
    els.file.addEventListener("change", function (event) {
      onFile(event.target.files && event.target.files[0]);
    });
    if (els.iconSearch) {
      els.iconSearch.addEventListener("beforeinput", function (event) {
        if (!event.data) {
          return;
        }
        if (/^[A-Za-z0-9\s\-]+$/.test(event.data)) {
          return;
        }
        event.preventDefault();
        var cleaned = latinIconQuery(event.data);
        if (!cleaned) {
          return;
        }
        var start = els.iconSearch.selectionStart || 0;
        var end = els.iconSearch.selectionEnd || 0;
        var next = latinIconQuery(
          els.iconSearch.value.slice(0, start) + cleaned + els.iconSearch.value.slice(end)
        );
        els.iconSearch.value = next;
        var caret = start + cleaned.length;
        try {
          els.iconSearch.setSelectionRange(caret, caret);
        } catch (ignored) {}
        els.iconSearch.dispatchEvent(new Event("input", { bubbles: true }));
      });
      els.iconSearch.addEventListener("input", function () {
        var cleaned = latinIconQuery(els.iconSearch.value);
        if (cleaned !== els.iconSearch.value) {
          var start = els.iconSearch.selectionStart || cleaned.length;
          var delta = els.iconSearch.value.length - cleaned.length;
          els.iconSearch.value = cleaned;
          try {
            els.iconSearch.setSelectionRange(Math.max(0, start - delta), Math.max(0, start - delta));
          } catch (ignored) {}
        }
        clearTimeout(iconSearchTimer);
        iconSearchTimer = setTimeout(function () {
          filterIconGrid(true);
        }, 50);
      });
    }
    window.addEventListener("resize", function () {
      if (els.iconLibrary && !els.iconLibrary.hidden) {
        paintIconWindow();
      }
    });

    ["dragenter", "dragover"].forEach(function (name) {
      els.dropZone.addEventListener(name, function (event) {
        event.preventDefault();
        els.dropZone.classList.add("is-over");
      });
    });
    ["dragleave", "drop"].forEach(function (name) {
      els.dropZone.addEventListener(name, function (event) {
        event.preventDefault();
        els.dropZone.classList.remove("is-over");
      });
    });
    els.dropZone.addEventListener("drop", function (event) {
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      onFile(file);
    });

    els.form.addEventListener("submit", function (event) {
      event.preventDefault();
    });

    document.querySelectorAll("[data-lang-set]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyLang(btn.getAttribute("data-lang-set"), true);
      });
    });

    document.querySelectorAll("[data-share-close]").forEach(function (node) {
      node.addEventListener("click", closeShareModal);
    });
    if (els.shareInstagram) {
      els.shareInstagram.addEventListener("click", function () {
        copyText(pageShareUrl()).then(function () {
          if (els.shareStatus) {
            els.shareStatus.hidden = false;
            els.shareStatus.textContent = t("shareCopiedIg");
          }
        });
      });
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeShareModal();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    els.form = $("generator");
    els.workspace = $("workspace");
    els.previewCol = $("preview-col");
    els.downloadActions = $("download-actions");
    els.dial = $("dial-code");
    els.phone = $("phone");
    els.phoneError = $("phone-error");
    els.message = $("message");
    els.count = $("message-count");
    els.website = $("website-url");
    els.websiteError = $("website-error");
    els.email = $("email-addr");
    els.emailError = $("email-error");
    els.subject = $("email-subject");
    els.body = $("email-body");
    els.wifiSsid = $("wifi-ssid");
    els.wifiPass = $("wifi-pass");
    els.wifiHidden = $("wifi-hidden");
    els.wifiError = $("wifi-error");
    els.wifiPassError = $("wifi-pass-error");
    els.wifiPassWrap = $("wifi-pass-wrap");
    els.navQuery = $("nav-query");
    els.navLat = $("nav-lat");
    els.navLng = $("nav-lng");
    els.navError = $("nav-error");
    els.navAddressWrap = $("nav-address-wrap");
    els.navCoordsWrap = $("nav-coords-wrap");
    els.eventTitle = $("event-title");
    els.eventStart = $("event-start");
    els.eventEnd = $("event-end");
    els.eventPlace = $("event-place");
    els.eventError = $("event-error");
    els.vcardName = $("vcard-name");
    els.vcardPhone = $("vcard-phone");
    els.vcardEmail = $("vcard-email");
    els.vcardUrl = $("vcard-url");
    els.vcardOrg = $("vcard-org");
    els.vcardError = $("vcard-error");
    els.link = $("result-link");
    els.linkLive = $("link-live");
    els.open = $("result-open");
    els.qrMount = $("qr-mount");
    els.context = $("context-preview");
    els.moduleColor = $("module-color");
    els.eyeColor = $("eye-color");
    els.pupilColor = $("pupil-color");
    els.bgColor = $("bg-color");
    els.bgClear = $("bg-clear");
    els.margin = $("margin");
    els.marginVal = $("margin-val");
    els.contrastNote = $("contrast-note");
    els.downloadContrast = $("download-contrast");
    els.eccNote = $("ecc-note");
    els.gradientOn = $("gradient-on");
    els.gradientTo = $("gradient-to");
    els.gradientAngle = $("gradient-angle");
    els.gradientAngleVal = $("gradient-angle-val");
    els.gradientFields = $("gradient-fields");
    els.brandRow = $("brand-row");
    els.designPaste = $("design-paste");
    els.designPasteError = $("design-paste-error");
    els.designCode = $("design-code");
    els.savedDesigns = $("saved-designs");
    els.applyDesignBtn = $("btn-apply-design");
    els.copyDesign = $("btn-copy-design");
    els.saveDesign = $("btn-save-design");
    els.saveDesignWrap = $("save-design-wrap");
    els.saveDesignName = $("save-design-name");
    els.saveDesignConfirm = $("btn-save-design-confirm");
    els.saveStatus = $("save-design-status");
    els.copyLink = $("btn-copy-link");
    els.copyImg = $("btn-copy-img");
    els.previewToggle = $("preview-toggle");
    els.inappBanner = $("inapp-banner");
    els.inappClose = $("inapp-close");
    els.renderError = $("render-error");
    els.clearNote = $("clear-note");
    els.cardCaptionWrap = $("card-caption-wrap");
    els.cardCaptionCustomWrap = $("card-caption-custom-wrap");
    els.cardCaptionText = $("card-caption-text");
    els.png = $("btn-png");
    els.svg = $("btn-svg");
    els.file = $("mark-file");
    els.dropZone = $("drop-zone");
    els.fileError = $("file-error");
    els.uploadPreview = $("upload-preview");
    els.iconGrid = $("icon-grid");
    els.iconSpecials = $("icon-specials");
    els.iconLibrary = $("icon-library");
    els.iconSearch = $("icon-search");
    els.iconScroller = $("icon-scroller");
    els.iconMeta = $("icon-meta");
    els.iconEmpty = $("icon-empty");
    els.iconControls = $("icon-controls");
    els.iconColorWrap = $("icon-color-wrap");
    els.iconColor = $("icon-color");
    els.markPadColor = $("mark-pad-color");
    els.markBorderColor = $("mark-border-color");
    els.markBorder = $("mark-border");
    els.markBorderVal = $("mark-border-val");
    els.markPad = $("mark-pad");
    els.markPadVal = $("mark-pad-val");
    els.markSize = $("mark-size");
    els.markSizeVal = $("mark-size-val");
    els.next = $("btn-next");
    els.back = $("btn-back");
    els.typeError = $("type-error");
    els.detailsLead = $("details-lead");
    els.logoPalette = $("logo-palette");
    els.logoSwatches = $("logo-swatches");
    els.shareModal = $("share-modal");
    els.shareFacebook = $("share-facebook");
    els.shareWhatsapp = $("share-whatsapp");
    els.shareInstagram = $("share-instagram");
    els.shareLinkedin = $("share-linkedin");
    els.shareStatus = $("share-status");

    applyLang(detectInterfaceLang(), false);
    showInAppBanner();
    fillDialCodes();
    mountSwatches();
    mountColorEditors();
    mountIcons();
    bind();
    restore();
    renderSavedDesigns();
    syncAllColorFields();
    goTo(step);
    renderPreview();
    fillShareLinks();
  });
})();
