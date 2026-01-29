# Snippet

A desktop app for macOS that grabs audio from the web: paste a URL, optionally trim and adjust speed, and save as MP3. No browser, no extra installs — everything is bundled.

**Experimental.** This app was built exclusively using [Cursor](https://cursor.com).

## Features

- Download audio/video from supported video and audio hosting sites
- Convert to MP3 format
- Trim audio by specifying start and end times (in HH:MM:SS format)
- Adjust playback speed (0.25x to 2x)
- Clean, minimal dark-themed UI
- Native macOS app — no browser needed

## Prerequisites

- **Node.js** (v16 or higher) — only needed if you want to develop or build the app locally. End users who install the built `.dmg` do not need Node, FFmpeg, or any other tools; everything is bundled.

## Installation

1. Install dependencies:
```bash
npm install
```

2. For development, run:
```bash
npm run dev
```

This will start the Vite dev server and launch the Electron app.

## Building the App

To build a distributable macOS app:

```bash
npm run build
npm run build:electron
```

The build step will automatically download the yt-dlp binary (via `prebuild` → `npm run download-yt-dlp`) if it is not already in `bin/yt-dlp`. FFmpeg is provided by the `ffmpeg-static` dependency — no system install needed.

This will create a `.dmg` file (e.g. in `dist/`) that you can install on your Mac. The packaged app is self-contained: no Node, FFmpeg, or yt-dlp installation required for end users.

## Usage

1. Launch the app (either via `npm run dev` for development or the built app)
2. Enter a video or audio URL
3. Optionally specify:
   - A custom title for the output file
   - Start and end times in HH:MM:SS format to trim the audio
   - Playback speed (0.25x to 2x)
4. Click "Download MP3"
5. The file will be automatically downloaded when processing is complete

## How It Works

- The app uses `yt-dlp` to download audio/video from various platforms
- `ffmpeg` is used to convert and trim the audio to MP3 format
- Files are temporarily stored during processing and automatically cleaned up
- Built with Electron for native macOS integration
- React + Vite for a modern, fast UI

## Development

- `npm run dev` — Start Vite dev server and launch Electron (hot reload). On first run, if `bin/yt-dlp` is missing, the app will try to download it to app userData.
- `npm run download-yt-dlp` — Download the yt-dlp binary into `bin/` for bundling (also runs automatically before `npm run build`).
- `npm run build` — Build the React app for production.
- `npm run build:electron` — Package the macOS app (DMG).
- `npm start` — Run the built Electron app (after building).

## Legal / Disclaimer

This software is provided for convenience only. **You are responsible for ensuring your use complies with applicable laws and the terms of service of the sites you use.** Only download content you have the right to download—for example, your own uploads, public domain material, or content you have explicit permission to use. The author does not encourage or endorse copyright infringement or violation of any platform&apos;s terms of service.

## Notes

- Processing time depends on the video length and your internet connection; large files may take longer.
- Temporary files are stored in the app&apos;s user data directory and cleaned up after processing.
- **Bundled dependencies:** The built app includes FFmpeg (via `ffmpeg-static`) and yt-dlp (in `bin/`). You do not need to install them on your system for development or for end users.
