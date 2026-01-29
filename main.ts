import type { BrowserWindow as BW, IpcMainInvokeEvent, Event as ElectronEvent } from 'electron';
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { URL } = require('url');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

let mainWindow: BW | null = null;
let tempDir: string = '';

const MAX_URL_LENGTH = 2048;

function getAllowedOrigins(): string[] {
	const distIndexPath = path.join(__dirname, 'dist', 'index.html');
	const isDev = process.env.NODE_ENV === 'development' || !fs.existsSync(distIndexPath);
	if (isDev) {
		return ['http://localhost:5173', 'http://127.0.0.1:5173'];
	}
	return ['file://'];
}

function isAllowedSender(event: IpcMainInvokeEvent): boolean {
	if (!mainWindow || event.sender !== mainWindow.webContents) {
		return false;
	}
	const senderUrl = event.sender.getURL();
	const allowed = getAllowedOrigins();
	return allowed.some((origin) => {
		if (origin === 'file://') {
			return senderUrl.startsWith('file://');
		}
		return senderUrl.startsWith(origin);
	});
}

function isLoopbackOrPrivateIP(hostname: string | null | undefined): boolean {
	if (!hostname || typeof hostname !== 'string') {
		return false;
	}
	const h = hostname.toLowerCase();

	if (net.isIP(h) === 4) {
		const parts = h.split('.').map(Number);
		if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
			return false;
		}
		const [a, b] = parts;
		if (a === 127) return true;
		if (a === 10) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (parts[0] === 0 && parts[1] === 0 && parts[2] === 0 && parts[3] === 0) return true;
		return false;
	}

	if (/^\d+$/.test(h)) {
		const num = parseInt(h, 10);
		if (num < 0 || num > 0xffffffff) return false;
		const a = (num >> 24) & 0xff;
		const b = (num >> 16) & 0xff;
		if (a === 127) return true;
		if (a === 10) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 0 && b === 0 && ((num >> 8) & 0xff) === 0 && (num & 0xff) === 0) return true;
		return false;
	}

	if (h === '::1' || h === '[::1]') return true;
	if (h.startsWith('::ffff:127.') || h.startsWith('::ffff:0x7f')) return true;
	if (h.startsWith('::ffff:7f')) return true;

	return false;
}

function validateUrl(input: unknown): string {
	if (!input || typeof input !== 'string') {
		throw new Error('URL is required');
	}
	const trimmed = input.trim();
	if (!trimmed) {
		throw new Error('URL is required');
	}
	if (trimmed.length > MAX_URL_LENGTH) {
		throw new Error('URL is too long');
	}
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error('Invalid URL');
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('Only HTTP and HTTPS URLs are allowed');
	}
	const hostname = parsed.hostname;
	const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'];
	if (blockedHosts.includes(hostname.toLowerCase())) {
		throw new Error('Localhost URLs are not allowed');
	}
	if (/^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./i.test(hostname)) {
		throw new Error('Private network URLs are not allowed');
	}
	if (isLoopbackOrPrivateIP(hostname)) {
		throw new Error('Localhost and private network URLs are not allowed');
	}
	return trimmed;
}

const MAX_DURATION_SECONDS = 604800;

interface DownloadParams {
	startTime?: number | string | null;
	endTime?: number | string | null;
	playbackSpeed?: number | string | null;
}

interface ValidatedParams {
	startTime?: number;
	endTime?: number;
	playbackSpeed?: number;
}

function validateDownloadParams(params: DownloadParams): ValidatedParams {
	const out: ValidatedParams = {};
	const startVal = params.startTime;
	if (startVal !== undefined && startVal !== null && startVal !== '') {
		const s = Number(startVal);
		if (Number.isNaN(s) || s < 0 || s > MAX_DURATION_SECONDS) {
			throw new Error('Invalid start time');
		}
		out.startTime = s;
	}
	const endVal = params.endTime;
	if (endVal !== undefined && endVal !== null && endVal !== '') {
		const e = Number(endVal);
		if (Number.isNaN(e) || e < 0 || e > MAX_DURATION_SECONDS) {
			throw new Error('Invalid end time');
		}
		out.endTime = e;
	}
	const speedVal = params.playbackSpeed;
	if (speedVal !== undefined && speedVal !== null && speedVal !== 1) {
		const p = Number(speedVal);
		if (Number.isNaN(p) || p < 0.25 || p > 4) {
			throw new Error('Playback speed must be between 0.25 and 4');
		}
		out.playbackSpeed = p;
	}
	return out;
}

if (ffmpegStatic) {
	let ffmpegPath: string = ffmpegStatic as string;
	if (app.isPackaged && typeof ffmpegPath === 'string' && ffmpegPath.includes('app.asar')) {
		ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
	}
	ffmpeg.setFfmpegPath(ffmpegPath);
}

function sanitizeFilename(title: unknown): string {
	if (!title || typeof title !== 'string') {
		return 'audio';
	}
	return (
		title
			.replace(/[<>:"/\\|?*]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
			.substring(0, 200) || 'audio'
	);
}

function getAtempoFilter(speed: number | null | undefined): string | null {
	if (!speed || speed === 1) {
		return null;
	}
	if (speed < 0.5) {
		if (speed === 0.25) {
			return 'atempo=0.5,atempo=0.5';
		}
		return `atempo=${speed}`;
	}
	if (speed > 2.0) {
		return `atempo=2.0,atempo=${speed / 2.0}`;
	}
	return `atempo=${speed}`;
}

function createWindow(): void {
	const distIndexPath = path.join(__dirname, 'dist', 'index.html');
	const isDev = process.env.NODE_ENV === 'development' || !fs.existsSync(distIndexPath);

	const win = new BrowserWindow({
		width: 600,
		height: 800,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			allowRunningInsecureContent: false,
			devTools: isDev,
		},
		backgroundColor: '#0a0a0a',
		titleBarStyle: 'hiddenInset',
		titleBarOverlay: {
			color: '#0a0a0a',
			symbolColor: '#ffffff',
		},
	});
	mainWindow = win;

	if (
		typeof (win as unknown as { setWindowOpenHandler?: (h: () => { action: string }) => void })
			.setWindowOpenHandler === 'function'
	) {
		(win as unknown as { setWindowOpenHandler: (h: () => { action: string }) => void }).setWindowOpenHandler(
			() => ({ action: 'deny' })
		);
	} else {
		(win.webContents as unknown as { on: (e: string, fn: (event: ElectronEvent) => void) => void }).on(
			'new-window',
			(event: ElectronEvent) => event.preventDefault()
		);
	}

	win.webContents.on('will-navigate', (event: ElectronEvent, url: string) => {
		const allowed = getAllowedOrigins();
		const allowedNav = allowed.some((origin) => {
			if (origin === 'file://') {
				return url.startsWith('file://');
			}
			return url.startsWith(origin);
		});
		if (!allowedNav) {
			event.preventDefault();
		}
	});

	win.webContents.on('will-redirect', (event: ElectronEvent, url: string) => {
		const allowed = getAllowedOrigins();
		const allowedNav = allowed.some((origin) => {
			if (origin === 'file://') {
				return url.startsWith('file://');
			}
			return url.startsWith(origin);
		});
		if (!allowedNav) {
			event.preventDefault();
		}
	});

	if (isDev) {
		win.loadURL('http://localhost:5173');
		win.webContents.openDevTools();
	} else {
		win.loadFile(distIndexPath);
	}

	win.on('closed', () => {
		mainWindow = null;
	});
}

function getBundledYtDlpPath(): string | null {
	const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

	if (isDev) {
		const devBinPath = path.join(__dirname, 'bin', 'yt-dlp');
		if (fs.existsSync(devBinPath)) {
			return devBinPath;
		}
		return null;
	}

	const resourcesPath = process.resourcesPath || path.join(__dirname, '..');
	const possiblePaths = [
		path.join(resourcesPath, 'app.asar.unpacked', 'bin', 'yt-dlp'),
		path.join(resourcesPath, 'bin', 'yt-dlp'),
		path.join(__dirname, '..', 'app.asar.unpacked', 'bin', 'yt-dlp'),
		path.join(__dirname, '..', 'bin', 'yt-dlp'),
	];

	for (const possiblePath of possiblePaths) {
		if (fs.existsSync(possiblePath)) {
			try {
				fs.chmodSync(possiblePath, 0o755);
			} catch (err) {
				console.warn('Could not set executable permissions on yt-dlp:', err);
			}
			console.log('Found yt-dlp at:', possiblePath);
			return possiblePath;
		}
	}

	console.error('yt-dlp binary not found. Tried paths:');
	possiblePaths.forEach((p) => console.error('  -', p));
	return null;
}

let ytDlpWrap: InstanceType<typeof YTDlpWrap>;

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.whenReady().then(async () => {
	try {
		const csp = [
			"default-src 'self'",
			"script-src 'self'",
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data:",
			"connect-src 'self'",
			"frame-ancestors 'none'",
			"base-uri 'self'",
			"form-action 'self'",
		].join('; ');
		session.defaultSession.webRequest.onHeadersReceived(
			(
				details: { url: string; responseHeaders: Record<string, string[]> },
				callback: (resp: { responseHeaders: Record<string, string[]> }) => void
			) => {
				if (!details.url.startsWith('file://')) {
					callback({ responseHeaders: details.responseHeaders });
					return;
				}
				const responseHeaders = { ...details.responseHeaders };
				if (!responseHeaders['Content-Security-Policy']) {
					responseHeaders['Content-Security-Policy'] = [csp];
				}
				responseHeaders['X-Content-Type-Options'] = ['nosniff'];
				responseHeaders['X-Frame-Options'] = ['DENY'];
				responseHeaders['Referrer-Policy'] = ['strict-origin-when-cross-origin'];
				responseHeaders['Permissions-Policy'] = [
					'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
				];
				callback({ responseHeaders });
			}
		);

		const bundledYtDlpPath = getBundledYtDlpPath();

		if (bundledYtDlpPath && fs.existsSync(bundledYtDlpPath)) {
			ytDlpWrap = new YTDlpWrap(bundledYtDlpPath);
			console.log('✅ Using bundled yt-dlp:', bundledYtDlpPath);
		} else {
			if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
				try {
					const userDataDir = app.getPath('userData');
					const binDir = path.join(userDataDir, 'bin');
					if (!fs.existsSync(binDir)) {
						fs.mkdirSync(binDir, { recursive: true });
					}
					const binaryPath = path.join(binDir, 'yt-dlp');

					if (!fs.existsSync(binaryPath)) {
						console.log('Downloading yt-dlp for dev mode...');
						await YTDlpWrap.downloadFromGithub(binaryPath);
						fs.chmodSync(binaryPath, 0o755);
					}

					ytDlpWrap = new YTDlpWrap(binaryPath);
					console.log('✅ Using dev yt-dlp:', binaryPath);
				} catch (error) {
					console.error('\n❌ ERROR: Failed to set up yt-dlp binary', error);
					console.error('Please ensure yt-dlp is available or place it in bin/yt-dlp\n');
					createWindow();
					return;
				}
			} else {
				console.error('\n❌ ERROR: Bundled yt-dlp binary not found');
				console.error('The app requires a bundled yt-dlp binary to run.');
				console.error('Make sure bin/yt-dlp exists and is included in the build.\n');
				createWindow();
				return;
			}
		}

		const userDataDir = app.getPath('userData');
		tempDir = path.join(userDataDir, 'temp');
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, { recursive: true });
		}

		createWindow();

		app.on('activate', () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				createWindow();
			}
		});
	} catch (error) {
		console.error('Fatal error during app initialization:', error);
		createWindow();
	}
});

ipcMain.handle('get-video-info', async (event: IpcMainInvokeEvent, { url }: { url: string }) => {
	if (!isAllowedSender(event)) {
		throw new Error('Unauthorized');
	}
	const validatedUrl = validateUrl(url);

	try {
		const videoInfo = await ytDlpWrap.getVideoInfo(validatedUrl);
		return {
			duration: videoInfo.duration || null,
			title: videoInfo.title || null,
		};
	} catch (error) {
		console.error('Error fetching video info:', error);
		throw new Error('Failed to fetch video info');
	}
});

ipcMain.handle(
	'download-mp3',
	async (
		event: IpcMainInvokeEvent,
		{
			url,
			title,
			startTime,
			endTime,
			playbackSpeed,
		}: { url: string; title?: string; startTime?: number; endTime?: number; playbackSpeed?: number }
	) => {
		if (!isAllowedSender(event)) {
			throw new Error('Unauthorized');
		}
		const validatedUrl = validateUrl(url);
		const validatedParams = validateDownloadParams({ startTime, endTime, playbackSpeed });
		const { startTime: startTimeVal, endTime: endTimeVal, playbackSpeed: playbackSpeedVal } = validatedParams;

		const timestamp = Date.now();
		const tempVideoPath = path.join(tempDir, `video_${timestamp}.%(ext)s`);
		const outputPath = path.join(tempDir, `output_${timestamp}.mp3`);

		try {
			let videoTitle = 'output';
			if (typeof title === 'string' && title.trim()) {
				videoTitle = sanitizeFilename(title.trim());
			} else {
				console.log('Fetching video info from:', validatedUrl);
				try {
					const videoInfo = await ytDlpWrap.getVideoInfo(validatedUrl);
					if (videoInfo && videoInfo.title) {
						videoTitle = sanitizeFilename(videoInfo.title);
					}
				} catch (infoError) {
					console.warn('Could not fetch video title, using default:', (infoError as Error).message);
				}
			}

			console.log('Downloading from:', validatedUrl);
			await ytDlpWrap.execPromise([
				validatedUrl,
				'--extractor-args',
				'youtube:player_client=android',
				'-f',
				'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best[height<=480]',
				'-o',
				tempVideoPath,
			]);

			const files = fs.readdirSync(tempDir);
			const downloadedFile = files.find((f: string) => {
				const baseName = f.replace(/\.[^/.]+$/, '');
				return baseName === `video_${timestamp}` || f.startsWith(`video_${timestamp}`);
			});

			if (!downloadedFile) {
				throw new Error('Downloaded file not found');
			}

			const downloadedFilePath = path.join(tempDir, downloadedFile);

			return new Promise((resolve, reject) => {
				let command = ffmpeg(downloadedFilePath).audioCodec('libmp3lame').audioBitrate(192).format('mp3');

				if (startTimeVal !== undefined) {
					command = command.seekInput(startTimeVal);
				}

				if (endTimeVal !== undefined) {
					const duration = endTimeVal - (startTimeVal ?? 0);
					if (duration > 0) {
						command = command.duration(duration);
					}
				}

				if (playbackSpeedVal !== undefined && playbackSpeedVal !== 1) {
					const atempoFilter = getAtempoFilter(playbackSpeedVal);
					if (atempoFilter) {
						command = command.audioFilters(atempoFilter);
					}
				}

				command
					.on('end', () => {
						const outputFiles = fs.readdirSync(tempDir);
						const finalOutput = outputFiles.find((f: string) => f.startsWith(`output_${timestamp}`));

						if (!finalOutput) {
							const mp3Files = outputFiles
								.filter((f: string) => f.endsWith('.mp3'))
								.map((f: string) => ({
									name: f,
									time: fs.statSync(path.join(tempDir, f)).mtime,
								}))
								.sort((a: { time: number }, b: { time: number }) => b.time - a.time);

							if (mp3Files.length > 0) {
								const finalFile = path.join(tempDir, mp3Files[0].name);
								const filename = `${videoTitle}.mp3`;
								const fileBuffer = fs.readFileSync(finalFile);
								[downloadedFilePath, finalFile].forEach((file: string) => {
									if (fs.existsSync(file)) {
										fs.unlinkSync(file);
									}
								});
								resolve({
									buffer: fileBuffer,
									filename: filename,
								});
							} else {
								reject(new Error('Output file not found'));
							}
						} else {
							const finalFile = path.join(tempDir, finalOutput);
							const filename = `${videoTitle}.mp3`;
							const fileBuffer = fs.readFileSync(finalFile);
							[downloadedFilePath, finalFile].forEach((file: string) => {
								if (fs.existsSync(file)) {
									fs.unlinkSync(file);
								}
							});
							resolve({
								buffer: fileBuffer,
								filename: filename,
							});
						}
					})
					.on('error', (err: Error) => {
						if (fs.existsSync(downloadedFilePath)) {
							fs.unlinkSync(downloadedFilePath);
						}
						reject(err);
					})
					.save(outputPath);
			});
		} catch (error) {
			console.error('Error:', error);

			const files = fs.readdirSync(tempDir);
			files.forEach((file: string) => {
				if (file.includes(timestamp.toString())) {
					try {
						fs.unlinkSync(path.join(tempDir, file));
					} catch (err) {
						console.error('Error cleaning up file:', err);
					}
				}
			});

			throw error;
		}
	}
);
