# Changelog

## 2.1.1

- **Step 1 · Source:** Only one source at a time — the other tab (URL or file) is disabled when one is in use; Reset clears the source but keeps the current tab when on step 1; Reset button is disabled until the user has entered a URL or chosen a file; URL input keeps focus while typing; Enter URL / Upload file styled as full-width tabs with bottom border when active; card keeps a fixed min-height when switching tabs so the layout doesn’t jump.
- **Footer:** Dotted step navigation removed; Back button added (shown from step 2); “Step X of 4” label remains on the left; buttons (Back, Reset, Continue/Convert/Download) on the right.
- **Theme:** Shared `theme.ts` for main-process window colors (background, title bar); main process imports from it instead of hardcoded hex in `main.ts`; values documented to match `src/style.scss`.

## 2.1.0

- **Step 1 · Source:** Option to enter a URL (existing) or upload an MP3 or MP4 file. In Electron, the file picker uses the system dialog; in the browser (localhost), a native file input is used.
- **Local file flow:** Uploaded files get duration and title from the file; trim and playback speed work the same. Conversion and download require the desktop app (Electron); in the browser, a message explains this. If duration can’t be read in the browser, step 3 shows a message and “Continue without trimming”; both video and audio elements are tried for duration.
- **Security:** Local file paths are restricted to allowed bases (user home, app temp, and on macOS `/Volumes` for mounted drives) so the renderer cannot request arbitrary files. SECURITY.md updated to document the new IPC APIs and local file path validation.
- **Step 2 · Title:** Focus is preserved in the title input while typing (no caret jump on re-render).
- **Step 3 · Trim:** Start must be before end and end after start; invalid times revert with a status message. Range sliders update the DOM during drag (no re-render) and only sync state on release, so knobs stay draggable; knobs cannot move past each other (value resets when crossing). Caret position is preserved in the start/end time inputs while typing.
- **Messaging:** Step 5 shows “Converting…” for uploaded files and “Downloading and converting…” for URLs; step 4 button shows “Convert” for file and “Download” for URL; step 6 button is “Start over” for both.
- **Docs:** Description and README updated to mention upload (MP4).

## 2.0.0

- **TypeScript:** Full migration from React/JSX to TypeScript. Renderer is vanilla TypeScript (no React); Electron main process and preload are written in TypeScript and compiled to JS for runtime.
- **SCSS:** Replaced CSS with a single `src/style.scss` using SCSS nesting (e.g. `.step { &-title { } }`, `.btn { &--primary { } }`). Colors use CSS custom properties (`:root` / `var(--color-*)`) so the theme can be changed in one place.
- **Code quality:** ESLint (TypeScript) and Prettier with project rules (tabs, single quotes). Husky + lint-staged run lint and format on staged files before every commit; `npm run build` runs lint first.
- **Dependencies:** Removed React, react-dom, framer-motion, @vitejs/plugin-react. Added TypeScript, ESLint, Prettier, Husky, lint-staged, sass/sass-embedded.
- **Docs:** README “Code quality” section; SECURITY.md and security behavior unchanged.

## 1.0.1

- **Security hardening:** IPC origin checks, URL validation (SSRF mitigation including decimal/IPv6 bypass fixes), download param validation, CSP and security headers, navigation/new-window blocking, DevTools disabled in production.
- **Validation audit:** Block alternate IP forms (e.g. decimal 2130706433, IPv6 loopback), guard title type to avoid main-process crash, cap start/end time to 7 days.
- **Documentation:** Added SECURITY.md; added GPL v3 license badge to README.
- **Compatibility:** Fallback for older Electron when `setWindowOpenHandler` is not available (use `new-window` event to block popups).
- **UI (Step 1):** Reset button hidden on step 1; Continue button shows a loading spinner and “Loading…” while fetching video info.

## 1.0.0 — Initial release
