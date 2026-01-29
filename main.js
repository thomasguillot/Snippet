const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

let mainWindow;
let tempDir; // Will be set after app is ready, in a writable location

// Configure ffmpeg to use bundled static binary if available
if (ffmpegStatic) {
	// In production, ffmpeg-static lives in app.asar.unpacked; path from require() points into app.asar
	let ffmpegPath = ffmpegStatic;
	if (app.isPackaged && typeof ffmpegPath === 'string' && ffmpegPath.includes('app.asar')) {
		ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
	}
	ffmpeg.setFfmpegPath(ffmpegPath);
}

// Function to sanitize filename
function sanitizeFilename(title) {
	if (!title || typeof title !== 'string') {
		return 'audio';
	}
	
	return title
		.replace(/[<>:"/\\|?*]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.substring(0, 200) || 'audio';
}

// Function to generate atempo filter string for playback speed
function getAtempoFilter(speed) {
	if (!speed || speed === 1) {
		return null;
	}
	
	if (speed < 0.5) {
		if (speed === 0.25) {
			return 'atempo=0.5,atempo=0.5';
		}
		return `atempo=${speed}`;
	} else if (speed > 2.0) {
		return `atempo=2.0,atempo=${speed / 2.0}`;
	} else {
		return `atempo=${speed}`;
	}
}

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 600,
		height: 800,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			nodeIntegration: false,
			contextIsolation: true,
		},
		backgroundColor: '#0a0a0a',
		titleBarStyle: 'hiddenInset',
		titleBarOverlay: {
			color: '#0a0a0a',
			symbolColor: '#ffffff',
		},
	});

	// Load the app
	const distIndexPath = path.join(__dirname, 'dist', 'index.html');
	const isDev =
		process.env.NODE_ENV === 'development' ||
		!fs.existsSync(distIndexPath);

	if (isDev) {
		// In dev, load Vite dev server
		mainWindow.loadURL('http://localhost:5173');
		mainWindow.webContents.openDevTools();
	} else {
		// In production, load the built files
		mainWindow.loadFile(distIndexPath);
	}

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

// Get path to bundled yt-dlp binary
function getBundledYtDlpPath() {
	// In production, binaries are unpacked from asar to resources
	const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
	
	if (isDev) {
		// In dev, look for binary in project root bin/ folder
		const devBinPath = path.join(__dirname, 'bin', 'yt-dlp');
		if (fs.existsSync(devBinPath)) {
			return devBinPath;
		}
		// Fallback: try to use system yt-dlp or download it
		return null;
	} else {
		// In production, use bundled binary from resources
		// When unpacked, bin/yt-dlp will be at: app.asar.unpacked/bin/yt-dlp
		// __dirname in production is: app.asar/
		// So we need to go up one level to Resources, then into app.asar.unpacked
		const resourcesPath = process.resourcesPath || path.join(__dirname, '..');
		
		// Try multiple possible locations
		const possiblePaths = [
			path.join(resourcesPath, 'app.asar.unpacked', 'bin', 'yt-dlp'),
			path.join(resourcesPath, 'bin', 'yt-dlp'),
			path.join(__dirname, '..', 'app.asar.unpacked', 'bin', 'yt-dlp'),
			path.join(__dirname, '..', 'bin', 'yt-dlp'),
		];
		
		for (const possiblePath of possiblePaths) {
			if (fs.existsSync(possiblePath)) {
				// Ensure it's executable
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
		possiblePaths.forEach(p => console.error('  -', p));
		
		return null;
	}
}

let ytDlpWrap;

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.whenReady().then(async () => {
	try {
		// Set up yt-dlp with bundled binary
		const bundledYtDlpPath = getBundledYtDlpPath();
		
		if (bundledYtDlpPath && fs.existsSync(bundledYtDlpPath)) {
			ytDlpWrap = new YTDlpWrap(bundledYtDlpPath);
			console.log('✅ Using bundled yt-dlp:', bundledYtDlpPath);
		} else {
			// Fallback: try to use system yt-dlp or download (dev mode only)
			if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
				try {
					// Try to download yt-dlp to userData in dev mode
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
					// Still create window so user can see the error
					createWindow();
					return;
				}
			} else {
				console.error('\n❌ ERROR: Bundled yt-dlp binary not found');
				console.error('The app requires a bundled yt-dlp binary to run.');
				console.error('Make sure bin/yt-dlp exists and is included in the build.\n');
				// Still create window so user can see the error
				createWindow();
				return;
			}
		}

		// Set up temp directory under userData (writable outside app.asar)
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
		// Create window anyway so user can see the error
		createWindow();
	}
});

// IPC handlers
ipcMain.handle('get-video-info', async (event, { url }) => {
	if (!url) {
		throw new Error('URL is required');
	}

	try {
		const videoInfo = await ytDlpWrap.getVideoInfo(url);
		return {
			duration: videoInfo.duration || null,
			title: videoInfo.title || null,
		};
	} catch (error) {
		console.error('Error fetching video info:', error);
		throw new Error('Failed to fetch video info');
	}
});

ipcMain.handle('download-mp3', async (event, { url, title, startTime, endTime, playbackSpeed }) => {
	if (!url) {
		throw new Error('URL is required');
	}

	const timestamp = Date.now();
	const tempVideoPath = path.join(tempDir, `video_${timestamp}.%(ext)s`);
	const outputPath = path.join(tempDir, `output_${timestamp}.mp3`);

	try {
		// Use provided title or fetch from video metadata
		let videoTitle = 'output';
		if (title && title.trim()) {
			videoTitle = sanitizeFilename(title.trim());
		} else {
			console.log('Fetching video info from:', url);
			try {
				const videoInfo = await ytDlpWrap.getVideoInfo(url);
				if (videoInfo && videoInfo.title) {
					videoTitle = sanitizeFilename(videoInfo.title);
				}
			} catch (infoError) {
				console.warn('Could not fetch video title, using default:', infoError.message);
			}
		}

		// Download the video/audio
		// Use android player client to avoid JS runtime requirement and reduce 403 errors
		console.log('Downloading from:', url);
		await ytDlpWrap.execPromise([
			url,
			'--extractor-args', 'youtube:player_client=android',
			'-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best[height<=480]',
			'-o', tempVideoPath,
		]);

		// Find the downloaded file
		const files = fs.readdirSync(tempDir);
		const downloadedFile = files.find(f => {
			const baseName = f.replace(/\.[^/.]+$/, '');
			return baseName === `video_${timestamp}` || f.startsWith(`video_${timestamp}`);
		});
		
		if (!downloadedFile) {
			throw new Error('Downloaded file not found');
		}

		const downloadedFilePath = path.join(tempDir, downloadedFile);

		// Convert to MP3 using fluent-ffmpeg
		return new Promise((resolve, reject) => {
			let command = ffmpeg(downloadedFilePath)
				.audioCodec('libmp3lame')
				.audioBitrate(192)
				.format('mp3');

			// Apply trimming if start or end time is provided
			if (startTime !== undefined && startTime !== null && startTime !== '') {
				command = command.seekInput(parseFloat(startTime));
			}

			if (endTime !== undefined && endTime !== null && endTime !== '') {
				const duration = parseFloat(endTime) - (parseFloat(startTime) || 0);
				if (duration > 0) {
					command = command.duration(duration);
				}
			}

			// Apply playback speed if provided and not 1x
			if (playbackSpeed !== undefined && playbackSpeed !== null && playbackSpeed !== 1) {
				const atempoFilter = getAtempoFilter(parseFloat(playbackSpeed));
				if (atempoFilter) {
					command = command.audioFilters(atempoFilter);
				}
			}

			command
				.on('end', () => {
					// Find the output file
					const outputFiles = fs.readdirSync(tempDir);
					const finalOutput = outputFiles.find(f => f.startsWith(`output_${timestamp}`));
					
					if (!finalOutput) {
						const mp3Files = outputFiles
							.filter(f => f.endsWith('.mp3'))
							.map(f => ({
								name: f,
								time: fs.statSync(path.join(tempDir, f)).mtime
							}))
							.sort((a, b) => b.time - a.time);
						
						if (mp3Files.length > 0) {
							const finalFile = path.join(tempDir, mp3Files[0].name);
							const filename = `${videoTitle}.mp3`;
							
							// Read file and return as buffer
							const fileBuffer = fs.readFileSync(finalFile);
							
							// Cleanup
							[downloadedFilePath, finalFile].forEach(file => {
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
						
						// Read file and return as buffer
						const fileBuffer = fs.readFileSync(finalFile);
						
						// Cleanup
						[downloadedFilePath, finalFile].forEach(file => {
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
				.on('error', (err) => {
					// Cleanup on error
					if (fs.existsSync(downloadedFilePath)) {
						fs.unlinkSync(downloadedFilePath);
					}
					reject(err);
				})
				.save(outputPath);
		});
	} catch (error) {
		console.error('Error:', error);
		
		// Cleanup on error
		const files = fs.readdirSync(tempDir);
		files.forEach(file => {
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
});
