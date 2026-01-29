# Changelog

## 1.0.1

- **Security hardening:** IPC origin checks, URL validation (SSRF mitigation including decimal/IPv6 bypass fixes), download param validation, CSP and security headers, navigation/new-window blocking, DevTools disabled in production.
- **Validation audit:** Block alternate IP forms (e.g. decimal 2130706433, IPv6 loopback), guard title type to avoid main-process crash, cap start/end time to 7 days.
- **Documentation:** Added SECURITY.md; added GPL v3 license badge to README.
- **Compatibility:** Fallback for older Electron when `setWindowOpenHandler` is not available (use `new-window` event to block popups).
- **UI (Step 1):** Reset button hidden on step 1; Continue button shows a loading spinner and “Loading…” while fetching video info.

## 1.0.0 — Initial release
