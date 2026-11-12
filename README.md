# QR Generator

## Live copies / עותקים חיים

**Official, and the one to use:** [https://arich-software.co.il/qr-code-wizard/](https://arich-software.co.il/qr-code-wizard/)

The company site serves this tool with hardened CSP and HSTS headers. MDN HTTP Observatory rates that setup A+ (125/100). Those headers block information leakage in the browser.

**הגרסה הרשמית, וזו שכדאי להשתמש בה:** [https://arich-software.co.il/qr-code-wizard/](https://arich-software.co.il/qr-code-wizard/)

האתר מגיש את הכלי עם כותרות CSP ו-HSTS מוקשחות. הדירוג ב-MDN HTTP Observatory הוא A+ (125/100). הכותרות חוסמות זליגת מידע ברמת הדפדפן.

**GitHub Pages mirror, for source checks only:** [https://a-rich-software.github.io/qr-code-wizard/](https://a-rich-software.github.io/qr-code-wizard/)

This mirror stays online so anyone can compare the open-source files. It is a weaker choice for everyday use with sensitive details, because GitHub Pages cannot send custom HTTP security headers and scores C.

**מראת GitHub Pages, לאימות קוד מקור בלבד:** [https://a-rich-software.github.io/qr-code-wizard/](https://a-rich-software.github.io/qr-code-wizard/)

המראה נשארת פעילה כדי שאפשר יהיה להשוות את קבצי הקוד הפתוח. היא פחות מתאימה לשימוש יומיומי בפרטים רגישים, כי שרתי GitHub Pages אינם יכולים לשלוח כותרות אבטחה מותאמות ב-HTTP ומקבלים דירוג C.

A free Link & QR file generator from [A.RICH Software](https://arich-software.co.il/). No sign-up, no ads, no tracking.

Create a WhatsApp, website, email, or phone link, style a QR code, and download PNG or SVG. The wizard is Hebrew/English and runs entirely in the browser.

## Use it

1. Choose the destination (WhatsApp, website, email, or call).
2. Fill in the details.
3. Pick colors, a center icon, or upload a logo.
4. Download PNG or SVG.

Generated files are free for personal and commercial use. No credit is required for the files you download.

## Privacy

Phone numbers, emails, Wi-Fi passwords, and uploaded logos stay only in sessionStorage and are deleted when the browser tab closes. localStorage keeps only the language and design preferences (colors and shapes, not form contents). There are no cookies, no analytics, and no usage tracking. The Heebo font is included with this site, so the page does not send form data to a font service.

## License

This repository uses a **custom A.RICH Software source license**, not MIT. See [LICENSE](LICENSE) and [license.html](https://arich-software.co.il/qr-code-wizard/license.html).

- **Output** (QR files and links you generate): free to use. No credit required.
- **Source code:** personal and commercial use allowed, with visible credit to [A.RICH Software](https://arich-software.co.il/).
- **Brand marks** in `assets/` are not licensed for reuse.

Third-party code keeps its own licenses. See [NOTICE](NOTICE):

- `vendor/qrcode-generator.js` — MIT (Kazuhiko Arase)
- `vendor/lucide-catalog.js` — ISC (Lucide; some glyphs also MIT Feather)
- `fonts/` — SIL Open Font License 1.1 (Heebo, Oded Ezer)
