# Changelog

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
