# Changelog

## 3.1.0

- **Accessibility:** Improved tab order and focus (step heading is focusable; focus moves to the step heading when continuing or going back). Status and error messages use live regions (`role="status"` / `role="alert"`, `aria-live`) so screen readers announce them; processing phase (“Downloading…” / “Converting…”) is announced. Form controls, actions, and the theme switcher have `aria-label`s; decorative icons use `aria-hidden`. Main content has a `main` landmark. Confetti on the success step is disabled when the user prefers reduced motion.
- **Theme selector:** User can choose light / dark / system (default). Preference is persisted via next-themes (localStorage) so the chosen theme applies on next launch.
- **Theme selector UI:** Tabs above the main card, right-aligned, with icons (sun, moon, monitor for system). Same Tabs style as the source selector (enclosed, fitted). Icons from react-icons (Feather). Theme tabs are hidden on the success step (step 6).
- **Show in Finder:** After successful conversion, a “Show in Finder” button appears below the card; opens the file’s location in the system file manager. Main process now saves MP3 directly to the user’s Downloads folder and returns the file path (no in-app blob download).
- **Processing step:** Reset button is hidden during the processing step (step 5). Main process sends “downloading” and “converting” phases via IPC; step 5 shows “Downloading…” then “Converting…” so it doesn’t feel stuck. Local file shows “Converting…” only.
- **Status as Alert:** Status messages (errors and validation hints) are now shown in an Alert instead of plain text; error-like messages use status="error”, others use status="warning”.
- **Dev / localhost:** Video info (duration, title) works when opening the app in the browser; Vite dev API `/api/video-info` uses `bin/yt-dlp`. When no Electron, step 4 “Continue” simulates the full flow (Processing → Conversion complete) so the full flow can be experienced in dev.
- **Keyboard:** Enter key submits Continue on each step (URL input, title, trim start/end, speed step).
- **Dev / localhost:** Alert above the card when in browser: “You're on localhost — for testing only. Download and conversion work only in the desktop app (run: npm run dev).”
- **Dev / localhost:** On step 6 in browser, “Show in Finder” button restarts the app (simulated flow).
- **Dev / localhost:** Step 4 “Continue” with uploaded file on localhost now simulates the full flow (same as URL).
- **Dev / localhost:** Simulated step 5 uses longer delays (3s / 6s) for easier debugging.
- **Security:** Vite dev API `/api/video-info` blocks private IP URLs (SSRF); SECURITY.md updated (show-item-in-folder, dev-only API).

## 3.0.2

- **Card:** Body has consistent minimum height across steps (no resize when switching steps); step 4 footer button label is always “Continue” (no Convert/Download).
- **Electron:** Window draggable via app region: whole app is drag region, card has no-drag so it stays interactive.
- **Provider:** Mount loader progress bar extracted to reusable `LoaderProgress` component.

## 3.0.1

- **Step 3 · Trim:** Start/end time inputs keep focus while typing; values are driven by `state.startInput`/`state.endInput` and synced from numeric state when duration is set (fetch, file info, slider) or URL is cleared.
- **Dark mode / loader:** Inline script in `index.html` sets theme class (`dark`/`light`) on `<html>` from system preference before first paint to avoid a flash of light theme. Mount loader shows an indeterminate progress bar (Chakra Progress, `value={null}`) for a minimum duration then fades out into the app.
- **Step 6 · Success:** Copy updated to “Conversion complete!” / “Your MP3 is ready.”; confetti (react-confetti) shown behind the card with slower physics (lower gravity, higher friction); card body hidden on step 6; single “Start over” action in card header with arrow-right icon (replaces “Reset” on step 6, duplicate button removed from body).
- **Dependencies:** Added react-confetti.

## 3.0.0

- **React + Chakra UI:** Full migration from vanilla TypeScript to React with Chakra UI. Renderer is now React (TSX); main process and preload remain TypeScript. UI uses Chakra components (Card, Stack, Tabs, Field, Input, Slider, Button, Alert, Badge, etc.) with a centered card layout.
- **Dark mode:** System-based dark mode via `next-themes` (ThemeProvider with `defaultTheme="system"`, `attribute="class"`). No forced theme.
- **Step 3 · Trim:** Range slider only shown when duration is available; when duration is missing in the browser, step shows disabled inputs, a warning Alert, and “Continue without trimming”. On localhost, a fake duration is used so the trim form and slider stay interactive. Slider and input handlers hardened (array checks, start &lt; end).
- **App icon:** Single source PNG at `src/assets/app-icon.png` (1024×1024 recommended). macOS `.icns` is generated at build time: `scripts/generate-icon.sh` uses `sips` and `iconutil` to produce all required sizes and writes `dist/app.icns`. `npm run generate-icon` runs the script; `build:electron` runs it before packaging. No committed `.icns`; `dist/` is already ignored.
- **Dependencies:** Added React, react-dom, @chakra-ui/react, @emotion/react, next-themes, react-icons, @vitejs/plugin-react, @types/react, @types/react-dom. Removed vanilla renderer and `src/style.scss`.

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
