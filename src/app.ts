const TOTAL_STEPS = 6;
const DISPLAY_STEPS = 4;

interface State {
	url: string;
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
	url: '',
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
	const api = window.electronAPI;
	if (!api?.downloadMP3) {
		setState({ status: 'Error: App not ready', isLoading: false, currentStep: 4 });
		return;
	}

	try {
		const result = await api.downloadMP3({
			url: state.url.trim(),
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
	if (state.currentStep === 1 && !state.url.trim()) {
		setState({ status: 'Please enter a URL to continue.' });
		return;
	}

	if (state.currentStep === 1) {
		setState({ isFetchingVideoInfo: true, status: '' });
		try {
			if (fetchInfoTimeoutId) {
				clearTimeout(fetchInfoTimeoutId);
				fetchInfoTimeoutId = null;
			}
			await fetchVideoInfo(state.url, true);
		} catch (err) {
			console.error('Error fetching video info:', err);
			setState({ status: 'Could not fetch video info. Please check the URL.', isFetchingVideoInfo: false });
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
		url: '',
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

function handleDotClick(step: number): void {
	if (step <= state.maxStepReached && step <= 4 && !state.isLoading) {
		setState({ currentStep: step });
	}
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
			step.append(
				el('h2', { className: 'step-title' }, 'Step 1 · URL'),
				el('p', { className: 'step-description' }, 'Paste the video or audio URL you want to convert to MP3.'),
				el(
					'p',
					{ className: 'disclaimer' },
					"Only download content you have the right to use. You are responsible for complying with each site's terms of service and applicable laws."
				),
				el('input', {
					className: 'text-input',
					type: 'url',
					id: 'url',
					placeholder: 'https://example.com/video or paste a link',
					'aria-label': 'URL',
					value: state.url,
					required: 'true',
				})
			);
			const urlInput = step.querySelector('#url') as HTMLInputElement;
			urlInput.value = state.url;
			urlInput.addEventListener('input', handleUrlChange);
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
				startInputEl.className = 'text-input text-input--inline';
				startInputEl.value = state.startInput;
				startInputEl.addEventListener('input', (e) => {
					const value = (e.target as HTMLInputElement).value;
					setState({ startInput: value });
					const secs = timeToSeconds(value);
					if (secs == null || secs < 0 || secs >= endVal || secs > dur) return;
					setState({ startSeconds: secs });
				});
				const endInputEl = document.createElement('input');
				endInputEl.type = 'text';
				endInputEl.className = 'text-input text-input--inline';
				endInputEl.value = state.endInput;
				endInputEl.addEventListener('input', (e) => {
					const value = (e.target as HTMLInputElement).value;
					setState({ endInput: value });
					const secs = timeToSeconds(value);
					if (secs == null || secs <= state.startSeconds || secs > dur) return;
					setState({ endSeconds: secs });
				});

				const rangeStart = document.createElement('input');
				rangeStart.type = 'range';
				rangeStart.min = '0';
				rangeStart.max = String(dur);
				rangeStart.value = String(state.startSeconds);
				rangeStart.className = 'dual-range-input dual-range-input--start';
				rangeStart.addEventListener('input', (e) => {
					const value = Number((e.target as HTMLInputElement).value);
					if (value >= (state.endSeconds ?? dur)) return;
					setState({ startSeconds: value });
				});
				const rangeEnd = document.createElement('input');
				rangeEnd.type = 'range';
				rangeEnd.min = '0';
				rangeEnd.max = String(dur);
				rangeEnd.value = String(endVal);
				rangeEnd.className = 'dual-range-input dual-range-input--end';
				rangeEnd.addEventListener('input', (e) => {
					const value = Number((e.target as HTMLInputElement).value);
					if (value <= state.startSeconds) return;
					setState({ endSeconds: value });
				});

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
					el(
						'div',
						{ className: 'dual-range' },
						el(
							'div',
							{ className: 'dual-range-track' },
							el('div', {
								className: 'dual-range-selection',
								style: `left: ${(state.startSeconds / dur) * 100}%; width: ${((endVal - state.startSeconds) / dur) * 100}%`,
							})
						),
						rangeStart,
						rangeEnd
					)
				);
			} else {
				step.append(
					el(
						'p',
						{ className: 'muted' },
						"Enter a valid URL in step 1 to fetch the video duration, then you'll be able to trim."
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
					"We're downloading and converting your audio. This can take a little while for longer videos."
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
					el('button', { type: 'button', className: 'btn btn--primary' }, 'Start new download')
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
		const dots = document.createElement('div');
		dots.className = 'dots';
		for (let i = 1; i <= DISPLAY_STEPS; i++) {
			const isActive = i === state.currentStep;
			const isClickable = i <= state.maxStepReached && !state.isLoading;
			const dot = el('button', {
				type: 'button',
				className: `dot ${isActive ? 'dot--active' : ''} ${isClickable ? 'dot--clickable' : ''}`,
				'aria-label': `Go to step ${i}`,
			});
			dot.addEventListener('click', () => isClickable && handleDotClick(i));
			dots.appendChild(dot);
		}
		footerLeft.appendChild(dots);
		footer.appendChild(footerLeft);

		const footerRight = document.createElement('div');
		footerRight.className = 'footer-right';
		if (state.currentStep > 1) {
			const resetBtn = el(
				'button',
				{ type: 'button', className: 'btn btn--secondary', disabled: state.isLoading ? 'true' : undefined },
				'Reset'
			);
			resetBtn.addEventListener('click', handleReset);
			footerRight.appendChild(resetBtn);
		}
		const nextLabel =
			state.currentStep === 1 && state.isFetchingVideoInfo
				? 'Loading…'
				: state.currentStep < 4
					? 'Continue'
					: state.currentStep === 4
						? 'Download'
						: 'Continue';
		const nextBtn = el('button', {
			type: 'button',
			className: 'btn btn--primary',
			disabled:
				state.isLoading ||
				(state.currentStep === 1 && state.isFetchingVideoInfo) ||
				state.currentStep >= TOTAL_STEPS
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
