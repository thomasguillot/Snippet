const TOTAL_STEPS = 6;
const DISPLAY_STEPS = 4;

type SourceType = 'url' | 'file';

interface State {
	sourceType: SourceType;
	url: string;
	sourceFilePath: string;
	sourceFile: File | null;
	title: string;
	titleTouched: boolean;
	durationSeconds: number | null;
	startSeconds: number;
	endSeconds: number | null;
	startInput: string;
	endInput: string;
	playbackSpeed: number;
	status: string;
	isLoading: boolean;
	isFetchingVideoInfo: boolean;
	currentStep: number;
	maxStepReached: number;
}

let state: State = {
	sourceType: 'url',
	url: '',
	sourceFilePath: '',
	sourceFile: null,
	title: '',
	titleTouched: false,
	durationSeconds: null,
	startSeconds: 0,
	endSeconds: null,
	startInput: '00:00:00',
	endInput: '',
	playbackSpeed: 1,
	status: '',
	isLoading: false,
	isFetchingVideoInfo: false,
	currentStep: 1,
	maxStepReached: 1,
};

let fetchInfoTimeoutId: ReturnType<typeof setTimeout> | null = null;

function tryMediaDuration(url: string, useVideo: boolean): Promise<number | null> {
	return new Promise((resolve) => {
		const media = useVideo ? document.createElement('video') : document.createElement('audio');
		media.preload = 'metadata';
		media.style.position = 'absolute';
		media.style.left = '-9999px';
		media.style.visibility = 'hidden';

		let settled = false;
		const done = (duration: number | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			media.remove();
			resolve(duration);
		};

		const timeoutId = setTimeout(() => done(null), 10000);

		media.addEventListener('loadedmetadata', () => {
			const d = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : null;
			done(d);
		});
		media.addEventListener('error', () => done(null));
		media.addEventListener('durationchange', () => {
			if (Number.isFinite(media.duration) && media.duration > 0) {
				done(media.duration);
			}
		});

		document.body.appendChild(media);
		media.src = url;
	});
}

async function getLocalFileInfoFromFile(file: File): Promise<{ duration: number | null; title: string }> {
	const url = URL.createObjectURL(file);
	const title = file.name.replace(/\.[^.]+$/, '') || 'audio';
	try {
		const isVideo = file.type.startsWith('video/') || /\.mp4$/i.test(file.name);
		let duration = await tryMediaDuration(url, isVideo);
		if (duration == null && isVideo) {
			duration = await tryMediaDuration(url, false);
		} else if (duration == null && !isVideo) {
			duration = await tryMediaDuration(url, true);
		}
		return { duration, title };
	} finally {
		URL.revokeObjectURL(url);
	}
}

function timeToSeconds(timeStr: string | undefined): number | null {
	if (!timeStr || typeof timeStr !== 'string') return null;
	const parts = timeStr.split(':').map((p) => Number(p));
	if (parts.some((p) => Number.isNaN(p))) return null;
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	return null;
}

function secondsToTime(seconds: number): string {
	if (!seconds || Number.isNaN(seconds)) return '00:00:00';
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function setState(partial: Partial<State>): void {
	state = { ...state, ...partial };
	render();
}

async function fetchVideoInfo(urlToFetch: string, force = false): Promise<void> {
	if (!urlToFetch?.trim()) return;
	const api = window.electronAPI;
	if (!api?.getVideoInfo) return;

	const data = await api.getVideoInfo(urlToFetch.trim());
	if (data.duration != null) {
		setState({
			durationSeconds: data.duration,
			startSeconds: 0,
			endSeconds: data.duration,
		});
	}
	if (data.title && (!state.titleTouched || force)) {
		setState({ title: data.title, titleTouched: force ? false : state.titleTouched });
	}
}

function handleUrlChange(e: Event): void {
	const newUrl = (e.target as HTMLInputElement).value;
	setState({ url: newUrl, titleTouched: false });
	requestAnimationFrame(() => document.getElementById('url')?.focus());

	if (fetchInfoTimeoutId) {
		clearTimeout(fetchInfoTimeoutId);
		fetchInfoTimeoutId = null;
	}

	if (!newUrl.trim()) {
		setState({
			durationSeconds: null,
			startSeconds: 0,
			endSeconds: null,
			title: '',
			titleTouched: false,
		});
		return;
	}

	fetchInfoTimeoutId = setTimeout(async () => {
		try {
			await fetchVideoInfo(newUrl);
		} catch (err) {
			console.error('Error fetching video info:', err);
		}
		fetchInfoTimeoutId = null;
	}, 500);
}

async function runDownload(): Promise<void> {
	setState({ status: '', isLoading: true, currentStep: 5 });
	if (state.sourceType === 'file' && state.sourceFile != null) {
		setState({
			status: 'Conversion and download are only available in the desktop app. Run: npm run dev',
			isLoading: false,
			currentStep: 4,
		});
		return;
	}
	const api = window.electronAPI;
	if (!api?.downloadMP3) {
		setState({ status: 'Error: App not ready', isLoading: false, currentStep: 4 });
		return;
	}

	try {
		const result = await api.downloadMP3({
			...(state.sourceType === 'url' ? { url: state.url.trim() } : { sourceFilePath: state.sourceFilePath }),
			title: state.title || null,
			startTime: state.startSeconds,
			endTime: state.endSeconds,
			playbackSpeed: state.playbackSpeed,
		});

		const blob = new Blob([result.buffer], { type: 'audio/mpeg' });
		const downloadUrl = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = downloadUrl;
		a.download = result.filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(downloadUrl);

		setState({ currentStep: 6, maxStepReached: 6 });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		setState({ status: `Error: ${message}`, currentStep: 4 });
	} finally {
		setState({ isLoading: false });
	}
}

async function handleNext(): Promise<void> {
	if (state.currentStep === 1) {
		const hasUrl = state.sourceType === 'url' && state.url.trim().length > 0;
		const hasFile =
			state.sourceType === 'file' && (state.sourceFilePath.trim().length > 0 || state.sourceFile != null);
		if (!hasUrl && !hasFile) {
			setState({
				status:
					state.sourceType === 'url'
						? 'Please enter a URL to continue.'
						: 'Please choose an MP4 file to continue.',
			});
			return;
		}

		setState({ isFetchingVideoInfo: true, status: '' });
		try {
			if (state.sourceType === 'file') {
				if (state.sourceFile != null) {
					const data = await getLocalFileInfoFromFile(state.sourceFile);
					if (data.duration != null) {
						setState({
							durationSeconds: data.duration,
							startSeconds: 0,
							endSeconds: data.duration,
						});
					}
					if (data.title && !state.titleTouched) {
						setState({ title: data.title, titleTouched: false });
					}
				} else {
					const api = window.electronAPI;
					if (!api?.getLocalFileInfo) {
						setState({ status: 'App not ready', isFetchingVideoInfo: false });
						return;
					}
					const data = await api.getLocalFileInfo(state.sourceFilePath);
					if (data.duration != null) {
						setState({
							durationSeconds: data.duration,
							startSeconds: 0,
							endSeconds: data.duration,
						});
					}
					if (data.title && !state.titleTouched) {
						setState({ title: data.title, titleTouched: false });
					}
				}
			} else {
				if (fetchInfoTimeoutId) {
					clearTimeout(fetchInfoTimeoutId);
					fetchInfoTimeoutId = null;
				}
				await fetchVideoInfo(state.url, true);
			}
		} catch (err) {
			console.error('Error fetching source info:', err);
			setState({
				status:
					state.sourceType === 'url'
						? 'Could not fetch video info. Please check the URL.'
						: 'Could not read file. Please choose a valid MP4 file.',
				isFetchingVideoInfo: false,
			});
			return;
		}
		setState({ isFetchingVideoInfo: false });
	}

	if (
		state.currentStep === 3 &&
		state.durationSeconds != null &&
		(state.endSeconds == null || state.endSeconds <= state.startSeconds)
	) {
		setState({ status: 'End time must be greater than start time.' });
		return;
	}

	if (state.currentStep < 4) {
		const next = state.currentStep + 1;
		setState({ currentStep: next, maxStepReached: Math.max(state.maxStepReached, next) });
	} else if (state.currentStep === 4 && !state.isLoading) {
		runDownload();
	}
}

function handleReset(): void {
	setState({
		sourceType: state.currentStep === 1 ? state.sourceType : 'url',
		url: '',
		sourceFilePath: '',
		sourceFile: null,
		title: '',
		titleTouched: false,
		durationSeconds: null,
		startSeconds: 0,
		endSeconds: null,
		startInput: '00:00:00',
		endInput: '',
		playbackSpeed: 1,
		status: '',
		isLoading: false,
		currentStep: 1,
		maxStepReached: 1,
	});
}

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	attrs: Record<string, string | undefined> & { className?: string; style?: string } = {},
	...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
	const elem = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (v == null) continue;
		if (k === 'className') elem.className = v;
		else if (k === 'style') (elem as HTMLElement).style.cssText = v;
		else if (k === 'aria-label') elem.setAttribute('aria-label', v);
		else if (k === 'value' && tag === 'input') (elem as HTMLInputElement).value = v;
		else if (k === 'placeholder') (elem as HTMLInputElement).placeholder = v;
		else if (k === 'type') (elem as HTMLInputElement).type = v;
		else if (k === 'min' || k === 'max' || k === 'step') elem.setAttribute(k, v);
		else if (k === 'required') (elem as HTMLInputElement).required = true;
		else if (k === 'disabled') (elem as HTMLButtonElement).disabled = true;
		else if (k === 'id') elem.id = v;
	}
	for (const c of children) {
		elem.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
	}
	return elem;
}

function renderStepContent(): HTMLElement {
	const step = document.createElement('div');
	step.className = 'step';

	switch (state.currentStep) {
		case 1: {
			const hasUrl = state.url.trim().length > 0;
			const hasFile = state.sourceFilePath.trim().length > 0 || state.sourceFile != null;
			const sourceTabs = document.createElement('div');
			sourceTabs.className = 'source-tabs';
			sourceTabs.setAttribute('role', 'tablist');
			sourceTabs.setAttribute('aria-label', 'Source type');
			const urlTabDisabled = hasFile;
			const fileTabDisabled = hasUrl;
			const urlTab = el(
				'button',
				{
					type: 'button',
					className: `source-tab ${state.sourceType === 'url' ? 'source-tab--active' : ''} ${urlTabDisabled ? 'source-tab--disabled' : ''}`,
					role: 'tab',
					'aria-selected': state.sourceType === 'url' ? 'true' : 'false',
					disabled: urlTabDisabled ? 'true' : undefined,
				},
				'Enter URL'
			);
			const fileTab = el(
				'button',
				{
					type: 'button',
					className: `source-tab ${state.sourceType === 'file' ? 'source-tab--active' : ''} ${fileTabDisabled ? 'source-tab--disabled' : ''}`,
					role: 'tab',
					'aria-selected': state.sourceType === 'file' ? 'true' : 'false',
					disabled: fileTabDisabled ? 'true' : undefined,
				},
				'Upload file'
			);
			urlTab.addEventListener('click', () => {
				if (urlTabDisabled) return;
				setState({ sourceType: 'url', sourceFilePath: '', sourceFile: null, status: '' });
			});
			fileTab.addEventListener('click', () => {
				if (fileTabDisabled) return;
				setState({ sourceType: 'file', url: '', sourceFilePath: '', sourceFile: null, status: '' });
			});
			sourceTabs.append(urlTab, fileTab);

			const sourceContent = document.createElement('div');
			sourceContent.className = 'step-source-content';

			step.append(
				el('h2', { className: 'step-title' }, 'Step 1 · Source'),
				el('p', { className: 'step-description' }, 'Paste a URL or upload an MP4 file to convert to MP3.'),
				sourceTabs,
				sourceContent
			);

			if (state.sourceType === 'url') {
				sourceContent.append(
					el('input', {
						className: 'text-input',
						type: 'url',
						id: 'url',
						placeholder: 'https://example.com/video or paste a link',
						'aria-label': 'URL',
						value: state.url,
						required: 'true',
					}),
					el(
						'p',
						{ className: 'disclaimer' },
						"Only download content you have the right to use. You are responsible for complying with each site's terms of service and applicable laws."
					)
				);
				const urlInput = step.querySelector('#url') as HTMLInputElement;
				if (urlInput) {
					urlInput.value = state.url;
					urlInput.addEventListener('input', handleUrlChange);
				}
			} else {
				const isElectron = typeof window.electronAPI?.openFileDialog === 'function';
				const chosenName =
					state.sourceFile?.name ?? (state.sourceFilePath ? state.sourceFilePath.split(/[/\\]/).pop() : null);
				const fileZone = document.createElement('div');
				fileZone.className = 'file-zone';
				if (chosenName) fileZone.classList.add('file-zone--has-file');

				if (isElectron) {
					const chooseBtn = el(
						'button',
						{
							type: 'button',
							className: 'btn btn--secondary file-choose-btn',
							'aria-label': 'Choose MP4 file',
						},
						chosenName ?? 'Choose MP4 file…'
					);
					fileZone.appendChild(chooseBtn);
					chooseBtn.addEventListener('click', async () => {
						const api = window.electronAPI;
						if (!api?.openFileDialog) return;
						setState({ status: '' });
						try {
							const { path: selectedPath } = await api.openFileDialog();
							if (selectedPath) {
								setState({ sourceFilePath: selectedPath, sourceFile: null, status: '' });
							}
						} catch (err) {
							setState({ status: err instanceof Error ? err.message : String(err) });
						}
					});
				} else {
					const fileInput = document.createElement('input');
					fileInput.type = 'file';
					fileInput.accept = '.mp3,.mp4,audio/mpeg,video/mp4';
					fileInput.className = 'file-input-hidden';
					fileInput.setAttribute('aria-label', 'Choose MP4 file');
					const chooseBtn = el(
						'button',
						{
							type: 'button',
							className: 'btn btn--secondary file-choose-btn',
							'aria-label': 'Choose MP4 file',
						},
						chosenName ?? 'Choose MP4 file…'
					);
					fileZone.append(fileInput, chooseBtn);
					chooseBtn.addEventListener('click', () => fileInput.click());
					fileInput.addEventListener('change', () => {
						const file = fileInput.files?.[0];
						if (file) {
							setState({ sourceFile: file, sourceFilePath: '', status: '' });
						}
						fileInput.value = '';
					});
				}
				sourceContent.append(fileZone);
			}
			break;
		}
		case 2: {
			step.append(
				el('h2', { className: 'step-title' }, 'Step 2 · Title'),
				el('p', { className: 'step-description' }, 'Choose a title for your MP3 file.'),
				el('input', {
					className: 'text-input',
					type: 'text',
					id: 'title',
					placeholder: 'Video title...',
					'aria-label': 'Title',
					value: state.title,
				})
			);
			const titleInput = step.querySelector('#title') as HTMLInputElement;
			titleInput.value = state.title;
			titleInput.addEventListener('input', (e) => {
				const v = (e.target as HTMLInputElement).value;
				setState({ title: v, titleTouched: state.titleTouched || true });
				requestAnimationFrame(() => document.getElementById('title')?.focus());
			});
			break;
		}
		case 3: {
			step.append(
				el('h2', { className: 'step-title' }, 'Step 3 · Start & End'),
				el(
					'p',
					{ className: 'step-description' },
					"Select the part of the audio you want to keep. We'll trim everything else."
				)
			);
			const dur = state.durationSeconds;
			if (dur != null) {
				const endVal = state.endSeconds ?? dur;
				const startInputEl = document.createElement('input');
				startInputEl.type = 'text';
				startInputEl.id = 'trim-start';
				startInputEl.className = 'text-input text-input--inline';
				startInputEl.value = state.startInput;
				startInputEl.addEventListener('input', (e) => {
					const input = e.target as HTMLInputElement;
					const value = input.value;
					const caretStart = input.selectionStart ?? 0;
					const secs = timeToSeconds(value);
					if (secs == null || secs < 0 || secs > dur) {
						setState({ startInput: value, status: '' });
						requestAnimationFrame(() => {
							const el = document.getElementById('trim-start') as HTMLInputElement;
							if (el) {
								el.focus();
								const pos = Math.min(caretStart + 1, el.value.length);
								el.setSelectionRange(pos, pos);
							}
						});
						return;
					}
					if (secs >= endVal) {
						setState({
							startInput: secondsToTime(state.startSeconds),
							status: 'Start must be before end.',
						});
						requestAnimationFrame(() => document.getElementById('trim-start')?.focus());
						return;
					}
					setState({ startInput: value, startSeconds: secs, status: '' });
					requestAnimationFrame(() => {
						const el = document.getElementById('trim-start') as HTMLInputElement;
						if (el) {
							el.focus();
							const pos = Math.min(caretStart + 1, el.value.length);
							el.setSelectionRange(pos, pos);
						}
					});
				});
				const endInputEl = document.createElement('input');
				endInputEl.type = 'text';
				endInputEl.id = 'trim-end';
				endInputEl.className = 'text-input text-input--inline';
				endInputEl.value = state.endInput;
				endInputEl.addEventListener('input', (e) => {
					const input = e.target as HTMLInputElement;
					const value = input.value;
					const caretStart = input.selectionStart ?? 0;
					const secs = timeToSeconds(value);
					if (secs == null || secs < 0 || secs > dur) {
						setState({ endInput: value, status: '' });
						requestAnimationFrame(() => {
							const el = document.getElementById('trim-end') as HTMLInputElement;
							if (el) {
								el.focus();
								const pos = Math.min(caretStart + 1, el.value.length);
								el.setSelectionRange(pos, pos);
							}
						});
						return;
					}
					if (secs <= state.startSeconds) {
						setState({
							endInput: secondsToTime(state.endSeconds ?? dur),
							status: 'End must be after start.',
						});
						requestAnimationFrame(() => document.getElementById('trim-end')?.focus());
						return;
					}
					setState({ endInput: value, endSeconds: secs, status: '' });
					requestAnimationFrame(() => {
						const el = document.getElementById('trim-end') as HTMLInputElement;
						if (el) {
							el.focus();
							const pos = Math.min(caretStart + 1, el.value.length);
							el.setSelectionRange(pos, pos);
						}
					});
				});

				let liveStart = state.startSeconds;
				let liveEnd = endVal;
				const selectionDiv = document.createElement('div');
				selectionDiv.className = 'dual-range-selection';
				selectionDiv.style.left = `${(liveStart / dur) * 100}%`;
				selectionDiv.style.width = `${((liveEnd - liveStart) / dur) * 100}%`;

				const rangeStart = document.createElement('input');
				rangeStart.type = 'range';
				rangeStart.min = '0';
				rangeStart.max = String(dur);
				rangeStart.value = String(state.startSeconds);
				rangeStart.className = 'dual-range-input dual-range-input--start';
				rangeStart.addEventListener('input', (e) => {
					const input = e.target as HTMLInputElement;
					const value = Number(input.value);
					if (value >= liveEnd) {
						input.value = String(liveStart);
						return;
					}
					liveStart = value;
					selectionDiv.style.left = `${(value / dur) * 100}%`;
					selectionDiv.style.width = `${((liveEnd - value) / dur) * 100}%`;
					startInputEl.value = secondsToTime(value);
				});
				rangeStart.addEventListener('change', (e) => {
					const value = Number((e.target as HTMLInputElement).value);
					const endSec = state.endSeconds ?? dur;
					const clamped = Math.min(value, endSec - 0.001);
					setState({ startSeconds: clamped });
				});
				const rangeEnd = document.createElement('input');
				rangeEnd.type = 'range';
				rangeEnd.min = '0';
				rangeEnd.max = String(dur);
				rangeEnd.value = String(endVal);
				rangeEnd.className = 'dual-range-input dual-range-input--end';
				rangeEnd.addEventListener('input', (e) => {
					const input = e.target as HTMLInputElement;
					const value = Number(input.value);
					if (value <= liveStart) {
						input.value = String(liveEnd);
						return;
					}
					liveEnd = value;
					selectionDiv.style.left = `${(liveStart / dur) * 100}%`;
					selectionDiv.style.width = `${((value - liveStart) / dur) * 100}%`;
					endInputEl.value = secondsToTime(value);
				});
				rangeEnd.addEventListener('change', (e) => {
					const value = Number((e.target as HTMLInputElement).value);
					const clamped = Math.max(value, state.startSeconds + 0.001);
					setState({ endSeconds: clamped });
				});

				const trackDiv = document.createElement('div');
				trackDiv.className = 'dual-range-track';
				trackDiv.appendChild(selectionDiv);
				const dualRangeWrap = document.createElement('div');
				dualRangeWrap.className = 'dual-range';
				dualRangeWrap.appendChild(trackDiv);
				dualRangeWrap.appendChild(rangeStart);
				dualRangeWrap.appendChild(rangeEnd);

				step.append(
					el(
						'div',
						{ className: 'range-row' },
						el(
							'div',
							{ className: 'range-header' },
							el('span', { className: 'range-label' }, 'Start'),
							startInputEl
						)
					),
					el(
						'div',
						{ className: 'range-row' },
						el(
							'div',
							{ className: 'range-header' },
							el('span', { className: 'range-label' }, 'End'),
							endInputEl
						)
					),
					dualRangeWrap
				);
			} else if (state.sourceType === 'file' && state.sourceFile != null) {
				step.append(
					el(
						'p',
						{ className: 'muted' },
						"Duration couldn't be read from your file in the browser. Use the desktop app to trim, or continue to convert the full file."
					),
					el('button', { type: 'button', className: 'btn btn--primary' }, 'Continue without trimming')
				);
				const continueBtn = step.querySelector('.btn--primary');
				if (continueBtn) {
					continueBtn.addEventListener('click', () => {
						setState({
							currentStep: 4,
							maxStepReached: Math.max(state.maxStepReached, 4),
						});
					});
				}
			} else {
				step.append(
					el(
						'p',
						{ className: 'muted' },
						"Enter a valid URL or choose a file in step 1 to get the duration, then you'll be able to trim."
					)
				);
			}
			break;
		}
		case 4: {
			const speedLabel = document.createElement('span');
			speedLabel.className = 'range-value';
			speedLabel.textContent = state.playbackSpeed.toFixed(2) + '×';
			const speedSlider = document.createElement('input');
			speedSlider.type = 'range';
			speedSlider.min = '0.25';
			speedSlider.max = '2';
			speedSlider.step = '0.25';
			speedSlider.value = String(state.playbackSpeed);
			speedSlider.className = 'range-input';
			speedSlider.addEventListener('input', (e) => {
				const v = parseFloat((e.target as HTMLInputElement).value);
				setState({ playbackSpeed: v });
				speedLabel.textContent = v.toFixed(2) + '×';
			});
			step.append(
				el('h2', { className: 'step-title' }, 'Step 4 · Playback speed'),
				el(
					'p',
					{ className: 'step-description' },
					'Adjust the playback speed. Faster speeds create shorter clips.'
				),
				el(
					'div',
					{ className: 'range-row' },
					el(
						'div',
						{ className: 'range-header' },
						el('span', { className: 'range-label' }, 'Speed'),
						speedLabel
					),
					speedSlider
				)
			);
			break;
		}
		case 5: {
			step.append(
				el('h2', { className: 'step-title' }, 'Processing…'),
				el(
					'p',
					{ className: 'step-description' },
					state.sourceType === 'file'
						? "We're converting your audio. This can take a little while for longer files."
						: "We're downloading and converting your audio. This can take a little while for longer videos."
				),
				el(
					'div',
					{ className: 'progress' },
					el('div', { className: 'progress-track' }, el('div', { className: 'progress-fill' })),
					el('p', { className: 'muted' }, 'Please keep the app open while we work on it.')
				)
			);
			break;
		}
		case 6: {
			step.append(
				el('h2', { className: 'step-title' }, 'Download complete!'),
				el('p', { className: 'step-description' }, 'Your MP3 has been downloaded successfully.'),
				el(
					'div',
					{ className: 'success' },
					el(
						'div',
						{ className: 'success-icon' },
						el('div', { className: 'success-circle' }),
						el('div', { className: 'success-check' })
					),
					el('button', { type: 'button', className: 'btn btn--primary' }, 'Start over')
				)
			);
			const btn = step.querySelector('.btn--primary');
			if (btn) btn.addEventListener('click', handleReset);
			break;
		}
		default:
			break;
	}

	return step;
}

function render(): void {
	const root = document.getElementById('root');
	if (!root) return;

	// Sync time inputs from numeric state
	state.startInput = secondsToTime(state.startSeconds);
	state.endInput = state.endSeconds != null ? secondsToTime(state.endSeconds) : '';

	const card = document.createElement('div');
	card.className = 'card';

	card.appendChild(renderStepContent());

	const statusEl = document.createElement('div');
	statusEl.className = 'status' + (state.status.includes('Error') ? ' status--error' : '');
	statusEl.textContent = state.status;
	if (state.status) card.appendChild(statusEl);

	if (state.currentStep <= 4) {
		const footer = document.createElement('div');
		footer.className = 'footer';

		const footerLeft = document.createElement('div');
		footerLeft.className = 'footer-left';
		footerLeft.appendChild(
			el(
				'span',
				{ className: 'step-label' },
				`Step ${Math.min(state.currentStep, DISPLAY_STEPS)} of ${DISPLAY_STEPS}`
			)
		);
		footer.appendChild(footerLeft);

		const footerRight = document.createElement('div');
		footerRight.className = 'footer-right';
		if (state.currentStep > 1) {
			const backBtn = el(
				'button',
				{ type: 'button', className: 'btn btn--secondary', disabled: state.isLoading ? 'true' : undefined },
				'Back'
			);
			backBtn.addEventListener('click', () => setState({ currentStep: state.currentStep - 1 }));
			footerRight.appendChild(backBtn);
		}
		const hasSourceToReset =
			state.url.trim().length > 0 || state.sourceFilePath.trim().length > 0 || state.sourceFile != null;
		const resetBtn = el(
			'button',
			{
				type: 'button',
				className: 'btn btn--secondary',
				disabled: state.isLoading || !hasSourceToReset ? 'true' : undefined,
			},
			'Reset'
		);
		resetBtn.addEventListener('click', handleReset);
		footerRight.appendChild(resetBtn);
		const nextLabel =
			state.currentStep === 1 && state.isFetchingVideoInfo
				? 'Loading…'
				: state.currentStep < 4
					? 'Continue'
					: state.currentStep === 4
						? state.sourceType === 'file'
							? 'Convert'
							: 'Download'
						: 'Continue';
		const hasSource =
			state.currentStep !== 1 ||
			(state.sourceType === 'url' && state.url.trim().length > 0) ||
			(state.sourceType === 'file' && (state.sourceFilePath.trim().length > 0 || state.sourceFile != null));
		const nextBtn = el('button', {
			type: 'button',
			className: 'btn btn--primary',
			disabled:
				state.isLoading ||
				(state.currentStep === 1 && state.isFetchingVideoInfo) ||
				state.currentStep >= TOTAL_STEPS ||
				!hasSource
					? 'true'
					: undefined,
		});
		if (state.currentStep === 1 && state.isFetchingVideoInfo) {
			nextBtn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>Loading…</span>';
		} else {
			nextBtn.textContent = nextLabel;
		}
		nextBtn.addEventListener('click', handleNext);
		footerRight.appendChild(nextBtn);
		footer.appendChild(footerRight);
		card.appendChild(footer);
	}

	root.innerHTML = '';
	root.appendChild(el('div', { className: 'app' }, el('div', { className: 'shell' }, card)));
}

export function init(): void {
	render();
}
