import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import './app.css';

function App() {
	const TOTAL_STEPS = 6; // logical flow steps (including progress + success)
	const DISPLAY_STEPS = 4; // user-facing steps (URL, Title, Range, Speed)

	const [url, setUrl] = useState('');
	const [title, setTitle] = useState('');
	const [titleTouched, setTitleTouched] = useState(false);
	const [durationSeconds, setDurationSeconds] = useState(null);
	const [startSeconds, setStartSeconds] = useState(0);
	const [endSeconds, setEndSeconds] = useState(null);
	const [startInput, setStartInput] = useState('00:00:00');
	const [endInput, setEndInput] = useState('');
	const [playbackSpeed, setPlaybackSpeed] = useState(1);
	const [status, setStatus] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [currentStep, setCurrentStep] = useState(1);
	const [maxStepReached, setMaxStepReached] = useState(1);
	const fetchInfoTimeoutRef = useRef(null);

	// Convert HH:MM:SS or MM:SS to seconds
	const timeToSeconds = (timeStr) => {
		if (!timeStr || typeof timeStr !== 'string') return null;

		const parts = timeStr.split(':').map((p) => Number(p));
		if (parts.some((p) => Number.isNaN(p))) return null;

		if (parts.length === 2) {
			// MM:SS
			return parts[0] * 60 + parts[1];
		}
		if (parts.length === 3) {
			// HH:MM:SS
			return parts[0] * 3600 + parts[1] * 60 + parts[2];
		}
		return null;
	};

	const secondsToTime = (seconds) => {
		if (!seconds || isNaN(seconds)) return '00:00:00';
		
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);
		
		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	};

	// Keep text fields in sync with numeric start/end seconds
	useEffect(() => {
		setStartInput(secondsToTime(startSeconds));
	}, [startSeconds]);

	useEffect(() => {
		if (endSeconds != null) {
			setEndInput(secondsToTime(endSeconds));
		} else {
			setEndInput('');
		}
	}, [endSeconds]);

	// Fetch video info and populate duration/title (respects manual title edits)
	const fetchVideoInfo = async (urlToFetch, { force = false } = {}) => {
		if (!urlToFetch || !urlToFetch.trim()) return;

		const api = window.electronAPI;
		if (!api || typeof api.getVideoInfo !== 'function') {
			return;
		}

		const data = await api.getVideoInfo(urlToFetch.trim());

		if (data.duration) {
			setDurationSeconds(data.duration);
			setStartSeconds(0);
			setEndSeconds(data.duration);
		}

		// Only overwrite title if user hasn't edited it OR we explicitly force refresh (e.g., on Continue)
		if (data.title && (!titleTouched || force)) {
			setTitle(data.title);
			if (force) {
				setTitleTouched(false);
			}
		}
	};

	// Fetch video info when URL is entered
	const handleUrlChange = (e) => {
		const newUrl = e.target.value;
		setUrl(newUrl);
		setTitleTouched(false);
		
		if (fetchInfoTimeoutRef.current) {
			clearTimeout(fetchInfoTimeoutRef.current);
		}
		
		if (!newUrl.trim()) {
			setDurationSeconds(null);
			setStartSeconds(0);
			setEndSeconds(null);
			setTitle('');
			setTitleTouched(false);
			return;
		}
		
		// Debounce the API call (only when Electron preload is available)
		fetchInfoTimeoutRef.current = setTimeout(async () => {
			try {
				await fetchVideoInfo(newUrl);
			} catch (error) {
				console.error('Error fetching video info:', error);
			}
		}, 500);
	};

	const runDownload = async () => {
		setStatus('');
		setIsLoading(true);
		setCurrentStep(5);

		try {
			const result = await window.electronAPI.downloadMP3({
				url: url.trim(),
				title: title || null,
				startTime: startSeconds,
				endTime: endSeconds,
				playbackSpeed: playbackSpeed,
			});

			// Convert buffer to blob and download
			const blob = new Blob([result.buffer], { type: 'audio/mpeg' });
			const downloadUrl = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = downloadUrl;
			a.download = result.filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(downloadUrl);

			setCurrentStep(6);
			setMaxStepReached(6);
		} catch (error) {
			console.error('Error:', error);
			setStatus(`Error: ${error.message}`);
			setCurrentStep(4);
		} finally {
			setIsLoading(false);
		}
	};

	const handleNext = async () => {
		if (currentStep === 1 && !url.trim()) {
			setStatus('Please enter a URL to continue.');
			return;
		}

		if (currentStep === 1) {
			// Ensure we fetched info (and title) before moving to step 2
			try {
				// Cancel any pending debounced fetch and force a fresh one
				if (fetchInfoTimeoutRef.current) {
					clearTimeout(fetchInfoTimeoutRef.current);
					fetchInfoTimeoutRef.current = null;
				}
				await fetchVideoInfo(url, { force: true });
			} catch (error) {
				console.error('Error fetching video info:', error);
				setStatus('Could not fetch video info. Please check the URL.');
			}
		}

		if (currentStep === 3 && durationSeconds && (endSeconds === null || endSeconds <= startSeconds)) {
			setStatus('End time must be greater than start time.');
			return;
		}

		if (currentStep < 4) {
			const next = currentStep + 1;
			setCurrentStep(next);
			setMaxStepReached(Math.max(maxStepReached, next));
		} else if (currentStep === 4 && !isLoading) {
			runDownload();
		}
	};

	const handleReset = () => {
		setUrl('');
		setTitle('');
		setTitleTouched(false);
		setDurationSeconds(null);
		setStartSeconds(0);
		setEndSeconds(null);
		setPlaybackSpeed(1);
		setStatus('');
		setIsLoading(false);
		setCurrentStep(1);
		setMaxStepReached(1);
	};

	const handleDotClick = (step) => {
		if (step <= maxStepReached && step <= 4 && !isLoading) {
			setCurrentStep(step);
		}
	};

	const renderStepContent = () => {
		switch (currentStep) {
			case 1:
				return (
					<div className="step">
						<h2 className="step-title">Step 1 · URL</h2>
						<p className="step-description">Paste the video or audio URL you want to convert to MP3.</p>
						<p className="disclaimer">
							Only download content you have the right to use. You are responsible for complying with each site&apos;s terms of service and applicable laws.
						</p>
						<input
							aria-label="URL"
							type="url"
							id="url"
							value={url}
							onChange={handleUrlChange}
							placeholder="https://example.com/video or paste a link"
							className="text-input"
							required
						/>
					</div>
				);
			case 2:
				return (
					<div className="step">
						<h2 className="step-title">Step 2 · Title</h2>
						<p className="step-description">Choose a title for your MP3 file.</p>
						<input
							aria-label="Title"
							type="text"
							id="title"
							value={title}
							onChange={(e) => {
								setTitle(e.target.value);
								if (!titleTouched) {
									setTitleTouched(true);
								}
							}}
							placeholder="Video title..."
							className="text-input"
						/>
					</div>
				);
			case 3:
				return (
					<div className="step">
						<h2 className="step-title">Step 3 · Start & End</h2>
						<p className="step-description">
							Select the part of the audio you want to keep. We&apos;ll trim everything else.
						</p>
						{durationSeconds ? (
							<>
								<div className="range-row">
									<div className="range-header">
										<span className="range-label">Start</span>
										<input
											type="text"
											className="text-input text-input--inline"
											value={startInput}
											onChange={(e) => {
												const value = e.target.value;
												setStartInput(value);
												const secs = timeToSeconds(value);
												if (
													secs == null ||
													secs < 0 ||
													(secs >= (endSeconds ?? durationSeconds)) ||
													secs > durationSeconds
												) {
													return;
												}
												setStartSeconds(secs);
											}}
										/>
									</div>
								</div>
								<div className="range-row">
									<div className="range-header">
										<span className="range-label">End</span>
										<input
											type="text"
											className="text-input text-input--inline"
											value={endInput}
											onChange={(e) => {
												const value = e.target.value;
												setEndInput(value);
												const secs = timeToSeconds(value);
												if (
													secs == null ||
													secs <= startSeconds ||
													secs > durationSeconds
												) {
													return;
												}
												setEndSeconds(secs);
											}}
										/>
									</div>
									<div className="dual-range">
										<div className="dual-range-track">
											<div
												className="dual-range-selection"
												style={{
													left: `${(startSeconds / durationSeconds) * 100}%`,
													width: `${((endSeconds ?? durationSeconds) - startSeconds) / durationSeconds * 100}%`,
												}}
											/>
										</div>
										<input
											type="range"
											min="0"
											max={durationSeconds}
											value={startSeconds}
											onChange={(e) => {
												const value = Number(e.target.value);
												if (value >= (endSeconds ?? durationSeconds)) return;
												setStartSeconds(value);
											}}
											className="dual-range-input dual-range-input--start"
										/>
										<input
											type="range"
											min="0"
											max={durationSeconds}
											value={endSeconds ?? durationSeconds}
											onChange={(e) => {
												const value = Number(e.target.value);
												if (value <= startSeconds) return;
												setEndSeconds(value);
											}}
											className="dual-range-input dual-range-input--end"
										/>
									</div>
								</div>
							</>
						) : (
							<p className="muted">
								Enter a valid URL in step 1 to fetch the video duration, then you&apos;ll be able to trim.
							</p>
						)}
					</div>
				);
			case 4:
				return (
					<div className="step">
						<h2 className="step-title">Step 4 · Playback speed</h2>
						<p className="step-description">
							Adjust the playback speed. Faster speeds create shorter clips.
						</p>
						<div className="range-row">
							<div className="range-header">
								<span className="range-label">Speed</span>
								<span className="range-value">{playbackSpeed.toFixed(2)}×</span>
							</div>
							<input
								type="range"
								min="0.25"
								max="2"
								step="0.25"
								value={playbackSpeed}
								onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
								className="range-input"
							/>
						</div>
					</div>
				);
			case 5:
				return (
					<div className="step">
						<h2 className="step-title">Processing…</h2>
						<p className="step-description">
							We&apos;re downloading and converting your audio. This can take a little while for longer videos.
						</p>
						<div className="progress">
							<div className="progress-track">
								<div className="progress-fill" />
							</div>
							<p className="muted">Please keep the app open while we work on it.</p>
						</div>
					</div>
				);
			case 6:
				return (
					<div className="step">
						<h2 className="step-title">Download complete!</h2>
						<p className="step-description">Your MP3 has been downloaded successfully.</p>
						<div className="success">
							<div className="success-icon">
								<div className="success-circle" />
								<div className="success-check" />
							</div>
							<button
								type="button"
								className="btn btn--primary"
								onClick={handleReset}
							>
								Start new download
							</button>
						</div>
					</div>
				);
			default:
				return null;
		}
	};

	return (
		<div className="app">
			<div className="shell">
				<div className="card">
					<AnimatePresence mode="wait">
						<motion.div
							key={currentStep}
							initial={{ opacity: 0, x: 24 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -24 }}
							transition={{ duration: 0.2, ease: 'easeOut' }}
						>
							{renderStepContent()}
						</motion.div>
					</AnimatePresence>

					{status && (
						<div className={`status ${status.includes('Error') ? 'status--error' : ''}`}>
							{status}
						</div>
					)}

					{currentStep <= 4 && (
						<div className="footer">
							<div className="footer-left">
								<span className="step-label">
									Step {Math.min(currentStep, DISPLAY_STEPS)} of {DISPLAY_STEPS}
								</span>
								<div className="dots">
									{Array.from({ length: DISPLAY_STEPS }).map((_, index) => {
										const step = index + 1;
										const isActive = step === currentStep;
										const isClickable = step <= maxStepReached && step <= DISPLAY_STEPS && !isLoading;

										return (
											<button
												key={step}
												type="button"
												onClick={() => isClickable && handleDotClick(step)}
												className={`dot ${isActive ? 'dot--active' : ''} ${isClickable ? 'dot--clickable' : ''}`}
												aria-label={`Go to step ${step}`}
											/>
										);
									})}
								</div>
							</div>

							<div className="footer-right">
								<button
									type="button"
									onClick={handleReset}
									className="btn btn--secondary"
									disabled={isLoading}
								>
									Reset
								</button>
								<button
									type="button"
									onClick={handleNext}
									className="btn btn--primary"
									disabled={isLoading || currentStep >= TOTAL_STEPS}
								>
									{currentStep < 4 ? 'Continue' : currentStep === 4 ? 'Download' : 'Continue'}
								</button>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export default App;
