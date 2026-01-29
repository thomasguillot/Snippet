#!/usr/bin/env node

/**
 * Script to download yt-dlp binary for bundling with the Electron app
 * Run this before building: node scripts/download-yt-dlp.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const BINARY_PATH = path.join(BIN_DIR, 'yt-dlp');

// Use the standalone macOS binary that bundles Python (no system Python needed)
const YT_DLP_URL_MACOS = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';

// Ensure bin directory exists
if (!fs.existsSync(BIN_DIR)) {
	fs.mkdirSync(BIN_DIR, { recursive: true });
}

function downloadWithRedirects(url, dest, cb) {
	https
		.get(url, (response) => {
			// Handle redirects (3xx)
			if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
				const nextUrl = response.headers.location.startsWith('http')
					? response.headers.location
					: new URL(response.headers.location, url).toString();
				console.log(`Redirecting to ${nextUrl}...`);
				response.resume(); // discard data
				return downloadWithRedirects(nextUrl, dest, cb);
			}

			if (response.statusCode !== 200) {
				cb(new Error(`Failed to download: HTTP ${response.statusCode}`));
				return;
			}

			const file = fs.createWriteStream(dest);
			response.pipe(file);

			file.on('finish', () => {
				file.close(cb);
			});
		})
		.on('error', (err) => {
			cb(err);
		});
}

console.log('Downloading standalone yt-dlp binary for macOS...');

downloadWithRedirects(YT_DLP_URL_MACOS, BINARY_PATH, (err) => {
	if (err) {
		if (fs.existsSync(BINARY_PATH)) {
			fs.unlinkSync(BINARY_PATH);
		}
		console.error('Error downloading yt-dlp:', err);
		process.exit(1);
	}

	// Make executable on Unix-like systems
	if (process.platform !== 'win32') {
		fs.chmodSync(BINARY_PATH, 0o755);
	}
	console.log(`✅ Downloaded yt-dlp to ${BINARY_PATH}`);
	console.log('The binary is now ready to be bundled with the app.');
});
