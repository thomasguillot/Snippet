# Security

This document describes the security model of Snippet and how to report vulnerabilities.

## Overview

Snippet is an Electron desktop app that downloads and converts audio from web URLs to MP3. Security is implemented in layers: the renderer process is isolated and sandboxed, all communication with the main process is validated, and user input (especially URLs) is restricted to prevent abuse.

## Security measures

### Renderer process (frontend)

- **Context isolation** — The renderer runs with `contextIsolation: true`; it cannot access Node.js or the preload script’s internals.
- **No Node integration** — `nodeIntegration: false` so the renderer has no `require()` or `process`.
- **Sandbox** — `sandbox: true` so the renderer runs in Chromium’s sandbox with reduced privileges.
- **No mixed content** — `allowRunningInsecureContent: false` so insecure resources are not loaded.
- **DevTools only in development** — In production, `devTools: false` so the DevTools cannot be opened from the app.
- **Navigation and new windows** — `setWindowOpenHandler(() => ({ action: 'deny' }))` blocks new windows; `will-navigate` and `will-redirect` allow only same-origin navigation (in production: `file://`; in dev: `http://localhost:5173`).

### Preload script

- **Minimal API** — Only `getVideoInfo(url)` and `downloadMP3(params)` are exposed via `contextBridge`.
- **Type checks** — The preload ensures `url` is a string and `params` is a plain object before forwarding to the main process.
- **Structured params** — For `downloadMP3`, only `url`, `title`, `startTime`, `endTime`, and `playbackSpeed` are passed through; other keys are dropped.

### Main process

- **IPC origin checks** — Every IPC handler verifies the sender with `isAllowedSender(event)`: the call must come from the app’s main window and from an allowed origin (in production: `file://`; in dev: `http://localhost:5173` or `http://127.0.0.1:5173`). Other origins receive “Unauthorized”.
- **URL validation (SSRF mitigation)** — All URLs passed to yt-dlp are validated:
  - Only `http:` and `https:` protocols.
  - Localhost and loopback are blocked (`localhost`, `127.0.0.1`, `0.0.0.0`, `::1`).
  - Private IP ranges are blocked (e.g. `10.x`, `172.16–31.x`, `192.168.x`).
  - Alternate IP forms are blocked: decimal IPv4 (e.g. `2130706433` = 127.0.0.1), IPv6 loopback (`::1`), and IPv4-mapped loopback (`::ffff:127.0.0.1`).
  - Maximum length: 2048 characters.
- **Download parameter validation** — `startTime` and `endTime` must be non-negative numbers and capped at 7 days (604 800 seconds) to avoid DoS or overflow; `playbackSpeed` must be between 0.25 and 4.
- **Title handling** — Only string values are used for the download filename; non-strings are ignored to avoid main-process crashes.
- **Filename sanitization** — User-provided titles are sanitized (invalid characters removed, length capped) before being used as file names.

### Content Security Policy and headers

- **CSP** — Applied via both a `<meta>` tag in `index.html` and (in production) via `session.defaultSession.webRequest` for `file://` responses. Scripts and resources are restricted to `'self'`; inline scripts are disallowed; `style-src` allows `'unsafe-inline'` for UI styling.
- **Security headers** (for `file://` in production, and via meta where applicable): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive **Permissions-Policy** (camera, microphone, geolocation, etc. disabled).

### Dependencies and build

- **Bundled binaries** — yt-dlp and ffmpeg are bundled or downloaded from trusted sources; in production, only unpacked app resources are used.
- **Temp files** — Download and conversion use a temp directory under the app’s user data path; files are removed after use or on error.

## Reporting a vulnerability

If you believe you’ve found a security issue in Snippet:

1. **Do not** open a public GitHub issue for it.
2. Send a private report to the maintainers (e.g. via email or a private security advisory if the project is on GitHub). Include:
   - A clear description of the issue and how to reproduce it.
   - The impact you think it has (e.g. what an attacker could do).
   - Any suggested fix or reference, if you have one.
3. Allow a reasonable time for a fix before disclosing publicly (e.g. 90 days), unless already disclosed.

We will acknowledge receipt and work on a fix. We may ask for more details and will keep you updated when possible.

## Known limitations

- **URL validation** — Hostnames are checked for private IP patterns; DNS rebinding or other resolution tricks are not mitigated at the URL-parsing level.
- **Third-party sites** — Downloading from a URL sends requests to that host; the app does not control the security or content of external sites (e.g. YouTube, other video hosts).
- **Electron and dependencies** — Keep Electron and npm dependencies up to date and review their security advisories (e.g. `npm audit`, Electron release notes).

Thank you for helping keep Snippet secure.
