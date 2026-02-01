import {
	AbsoluteCenter,
	Alert,
	Badge,
	Box,
	Button,
	Card,
	Field,
	HStack,
	Icon,
	Input,
	Slider,
	Spinner,
	Stack,
	Tabs,
	Text,
	VStack,
} from '@chakra-ui/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Confetti from 'react-confetti';
import { useTheme } from 'next-themes';
import { getLocalFileInfoFromFile, secondsToTime, timeToSeconds } from '@/lib/utils';
import { FiArrowRight, FiMonitor, FiMoon, FiSun } from 'react-icons/fi';

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
	lastDownloadPath: string | null;
	processingPhase: 'converting' | 'downloading' | null;
}

const initialState: State = {
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
	lastDownloadPath: null,
	processingPhase: null,
};

const VIDEO_INFO_ERROR_MESSAGE = "This link isn't supported or couldn't be reached. Check the URL or try another.";

async function fetchVideoInfo(urlToFetch: string): Promise<{ duration?: number; title?: string }> {
	if (!urlToFetch?.trim()) return {};
	const api = window.electronAPI;
	if (api?.getVideoInfo) {
		return api.getVideoInfo(urlToFetch.trim());
	}
	// When running in browser (no Electron), e.g. localhost in dev, use Vite dev API so video info still works
	try {
		const res = await fetch(`/api/video-info?url=${encodeURIComponent(urlToFetch.trim())}`);
		const data = (await res.json()) as { duration?: number | null; title?: string | null; error?: string };
		if (!res.ok) {
			throw new Error(
				typeof data?.error === 'string' && data.error.trim() ? data.error : VIDEO_INFO_ERROR_MESSAGE
			);
		}
		return {
			duration: data.duration ?? undefined,
			title: data.title ?? undefined,
		};
	} catch {
		throw new Error(VIDEO_INFO_ERROR_MESSAGE);
	}
}

type ThemeValue = 'dark' | 'light' | 'system';

export function App() {
	const [state, setState] = useState<State>(initialState);
	const fetchInfoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [windowSize, setWindowSize] = useState({ height: 0, width: 0 });
	const { setTheme, theme } = useTheme();
	const themeValue = (theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system') as ThemeValue;

	useEffect(() => {
		const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
		updateSize();
		window.addEventListener('resize', updateSize);
		return () => window.removeEventListener('resize', updateSize);
	}, []);

	// Debounced URL fetch
	useEffect(() => {
		if (state.sourceType !== 'url' || !state.url.trim()) return;
		if (fetchInfoTimeoutRef.current) {
			clearTimeout(fetchInfoTimeoutRef.current);
			fetchInfoTimeoutRef.current = null;
		}
		fetchInfoTimeoutRef.current = setTimeout(async () => {
			try {
				const data = await fetchVideoInfo(state.url);
				setState((prev) => {
					const next = { ...prev, status: '' };
					if (data.duration != null) {
						next.durationSeconds = data.duration;
						next.startSeconds = 0;
						next.endSeconds = data.duration;
						next.startInput = secondsToTime(0);
						next.endInput = secondsToTime(data.duration);
					}
					if (data.title && !prev.titleTouched) {
						next.title = data.title;
					}
					return next;
				});
			} catch (err) {
				console.error('Error fetching video info:', err);
				const message = err instanceof Error ? err.message : VIDEO_INFO_ERROR_MESSAGE;
				setState((prev) => ({
					...prev,
					status: message,
					durationSeconds: null,
					endSeconds: null,
					startSeconds: 0,
					startInput: '00:00:00',
					endInput: '',
					...(prev.titleTouched ? {} : { title: '' }),
				}));
			}
			fetchInfoTimeoutRef.current = null;
		}, 500);
		return () => {
			if (fetchInfoTimeoutRef.current) clearTimeout(fetchInfoTimeoutRef.current);
		};
	}, [state.sourceType, state.url]);

	const runDownload = useCallback(async () => {
		const isLocalFile = state.sourceType === 'file' && state.sourceFilePath.trim().length > 0;
		setState((prev) => ({
			...prev,
			status: '',
			isLoading: true,
			currentStep: 5,
			processingPhase: isLocalFile ? 'converting' : 'downloading',
		}));
		const api = window.electronAPI;
		if (!api?.downloadMP3) {
			// Dev/browser: simulate the full flow so we can experience step 5 → 6 (no actual file, URL or upload)
			// Longer delays on localhost so step 5 phases are easier to debug
			setTimeout(() => {
				setState((prev) => (prev.currentStep === 5 ? { ...prev, processingPhase: 'converting' } : prev));
			}, 3000);
			setTimeout(() => {
				setState((prev) => ({
					...prev,
					currentStep: 6,
					maxStepReached: 6,
					isLoading: false,
					lastDownloadPath: null,
					processingPhase: null,
				}));
			}, 6000);
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
			setState((prev) => ({
				...prev,
				currentStep: 6,
				maxStepReached: 6,
				isLoading: false,
				lastDownloadPath: result.filePath,
				processingPhase: null,
			}));
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setState((prev) => ({
				...prev,
				status: `Error: ${message}`,
				currentStep: 4,
				isLoading: false,
				processingPhase: null,
			}));
		}
	}, [
		state.sourceType,
		state.url,
		state.sourceFilePath,
		state.title,
		state.startSeconds,
		state.endSeconds,
		state.playbackSpeed,
	]);

	const handleNext = useCallback(async () => {
		if (state.currentStep === 1) {
			const hasUrl = state.sourceType === 'url' && state.url.trim().length > 0;
			const hasFile =
				state.sourceType === 'file' && (state.sourceFilePath.trim().length > 0 || state.sourceFile != null);
			if (!hasUrl && !hasFile) {
				setState((prev) => ({
					...prev,
					status:
						prev.sourceType === 'url'
							? 'Please enter a URL to continue.'
							: 'Please choose an MP4 file to continue.',
				}));
				return;
			}
			setState((prev) => ({ ...prev, isFetchingVideoInfo: true, status: '' }));
			try {
				if (state.sourceType === 'file') {
					if (state.sourceFile != null) {
						const data = await getLocalFileInfoFromFile(state.sourceFile);
						setState((prev) => {
							const next = { ...prev };
							if (data.duration != null) {
								next.durationSeconds = data.duration;
								next.startSeconds = 0;
								next.endSeconds = data.duration;
								next.startInput = secondsToTime(0);
								next.endInput = secondsToTime(data.duration);
							}
							if (data.title && !prev.titleTouched) next.title = data.title;
							return next;
						});
					} else {
						const api = window.electronAPI;
						if (!api?.getLocalFileInfo) {
							setState((prev) => ({ ...prev, status: 'App not ready', isFetchingVideoInfo: false }));
							return;
						}
						const data = await api.getLocalFileInfo(state.sourceFilePath);
						setState((prev) => {
							const next = { ...prev };
							if (data.duration != null) {
								next.durationSeconds = data.duration;
								next.startSeconds = 0;
								next.endSeconds = data.duration;
								next.startInput = secondsToTime(0);
								next.endInput = secondsToTime(data.duration);
							}
							if (data.title && !prev.titleTouched) next.title = data.title;
							return next;
						});
					}
				} else {
					const data = await fetchVideoInfo(state.url);
					setState((prev) => {
						const next = { ...prev };
						if (data.duration != null) {
							next.durationSeconds = data.duration;
							next.startSeconds = 0;
							next.endSeconds = data.duration;
							next.startInput = secondsToTime(0);
							next.endInput = secondsToTime(data.duration);
						}
						if (data.title && !prev.titleTouched) next.title = data.title;
						return next;
					});
				}
			} catch (err) {
				console.error('Error fetching source info:', err);
				const message =
					state.sourceType === 'url'
						? err instanceof Error
							? err.message
							: VIDEO_INFO_ERROR_MESSAGE
						: 'Could not read file. Please choose a valid MP4 file.';
				setState((prev) => ({
					...prev,
					status: message,
					isFetchingVideoInfo: false,
				}));
				return;
			}
			setState((prev) => ({ ...prev, isFetchingVideoInfo: false }));
		}

		if (
			state.currentStep === 3 &&
			state.durationSeconds != null &&
			(state.endSeconds == null || state.endSeconds <= state.startSeconds)
		) {
			setState((prev) => ({ ...prev, status: 'End time must be greater than start time.' }));
			return;
		}

		if (state.currentStep < 4) {
			const next = state.currentStep + 1;
			setState((prev) => ({
				...prev,
				currentStep: next,
				maxStepReached: Math.max(prev.maxStepReached, next),
			}));
		} else if (state.currentStep === 4 && !state.isLoading) {
			runDownload();
		}
	}, [state, runDownload]);

	const handleReset = useCallback(() => {
		setState({
			...initialState,
			lastDownloadPath: null,
			processingPhase: null,
			sourceType: state.currentStep === 1 ? state.sourceType : 'url',
		});
	}, [state.currentStep]);

	// Enter to continue on step 4 (speed); no main input, so listen at document level
	useEffect(() => {
		if (state.currentStep !== 4) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Enter') return;
			// Let the Continue button handle Enter when it's focused
			if (e.target instanceof HTMLElement && e.target.closest('button')) return;
			e.preventDefault();
			handleNext();
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [state.currentStep, handleNext]);

	// Subscribe to main-process phase updates (Downloading… / Converting…)
	useEffect(() => {
		const api = window.electronAPI;
		if (!api?.onProcessingPhase) return undefined;
		return api.onProcessingPhase((phase) => {
			setState((prev) => (prev.currentStep === 5 ? { ...prev, processingPhase: phase } : prev));
		});
	}, []);

	const hasSource =
		state.currentStep !== 1 ||
		(state.sourceType === 'url' && state.url.trim().length > 0) ||
		(state.sourceType === 'file' && (state.sourceFilePath.trim().length > 0 || state.sourceFile != null));
	const hasSourceToReset =
		state.url.trim().length > 0 || state.sourceFilePath.trim().length > 0 || state.sourceFile != null;

	const dur = state.durationSeconds ?? 0;
	const endVal = state.endSeconds ?? dur;

	// On localhost (browser) we may have no duration from a file; use a fake duration so the trim form and slider can display and be interactive
	const isBrowser = typeof window !== 'undefined' && !window.electronAPI;
	const FAKE_DURATION = 300; // 5 minutes, for display only when duration isn't available
	const effectiveDur = dur > 0 ? dur : isBrowser ? FAKE_DURATION : 0;
	const effectiveEndVal = dur > 0 ? endVal : isBrowser ? effectiveDur : 0;
	const formDisabled = dur <= 0 && !isBrowser;

	const stepHeader =
		state.currentStep === 1
			? { title: 'Source', description: 'Paste a URL or upload an MP4 file to convert to MP3.' }
			: state.currentStep === 2
				? { title: 'Title', description: 'Choose a title for your MP3 file.' }
				: state.currentStep === 3
					? {
							title: 'Start & End',
							description: 'Select the part of the audio you want to keep.',
						}
					: state.currentStep === 4
						? {
								title: 'Playback speed',
								description: 'Adjust the playback speed.',
							}
						: state.currentStep === 5
							? {
									title: 'Processing…',
									description:
										state.sourceType === 'file'
											? "We're converting your audio. This can take a little while for longer files."
											: "We're downloading and converting your audio. This can take a little while for longer videos.",
								}
							: {
									title: 'Conversion complete!',
									description: 'Your MP3 is ready.',
								};

	return (
		<Box minH="100vh" position="relative" w="100%" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
			{state.currentStep === 6 && windowSize.width > 0 && windowSize.height > 0 && (
				<Box height="100vh" left={0} pointerEvents="none" position="fixed" top={0} width="100vw" zIndex={0}>
					<Confetti
						friction={0.98}
						gravity={0.05}
						height={windowSize.height}
						initialVelocityY={5}
						numberOfPieces={256}
						recycle={true}
						width={windowSize.width}
					/>
				</Box>
			)}
			<AbsoluteCenter axis="both" width="100%" maxW="512px" p={6} zIndex={1}>
				<Stack
					direction="column"
					gap={4}
					width="100%"
					style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
				>
					{state.currentStep !== 6 && (
						<Box
							display="flex"
							justifyContent="flex-end"
							width="100%"
							style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
						>
							<Tabs.Root
								fitted
								size="sm"
								value={themeValue}
								variant="enclosed"
								onValueChange={(e) => setTheme((e.value as ThemeValue) ?? 'system')}
							>
								<Tabs.List borderRadius="full">
									<Tabs.Trigger value="system" title="System" padding={0} borderRadius="full">
										<Icon as={FiMonitor} height="16px" width="16px" />
									</Tabs.Trigger>
									<Tabs.Trigger value="light" title="Light" padding={0} borderRadius="full">
										<Icon as={FiSun} height="16px" width="16px" />
									</Tabs.Trigger>
									<Tabs.Trigger value="dark" title="Dark" padding={0} borderRadius="full">
										<Icon as={FiMoon} height="16px" width="16px" />
									</Tabs.Trigger>
								</Tabs.List>
							</Tabs.Root>
						</Box>
					)}
					{typeof window !== 'undefined' && !window.electronAPI && (
						<Alert.Root status="warning" variant="subtle">
							<Alert.Content>
								<Alert.Description>
									You're on localhost — for testing only. Download and conversion work only in the
									desktop app (run: npm run dev).
								</Alert.Description>
							</Alert.Content>
						</Alert.Root>
					)}
					<Card.Root width="100%" size="lg" variant="elevated">
						<Card.Header
							borderBottomWidth={state.currentStep === 6 ? 0 : '1px'}
							paddingBlock="3"
							paddingInline="3"
						>
							<HStack justify="space-between" align="center" gap={4} width="100%">
								<Stack gap={1} flex={1} minW={0}>
									<HStack gap={2} align="center" flexWrap="wrap">
										<Card.Title
											as="h1"
											fontFamily="heading"
											fontSize="md"
											fontWeight="semibold"
											lineHeight="moderate"
										>
											{stepHeader.title}
										</Card.Title>
										{state.currentStep <= 4 && (
											<Badge variant="subtle">
												Step {Math.min(state.currentStep, DISPLAY_STEPS)} of {DISPLAY_STEPS}
											</Badge>
										)}
									</HStack>
									<Card.Description fontSize="xs" color="fg.muted">
										{stepHeader.description}
									</Card.Description>
								</Stack>
								{(hasSourceToReset || state.currentStep === 6) && state.currentStep !== 5 && (
									<Button
										size={state.currentStep === 6 ? 'md' : 'xs'}
										variant={state.currentStep === 6 ? 'subtle' : 'ghost'}
										colorPalette={state.currentStep === 6 ? 'gray' : 'red'}
										disabled={state.isLoading}
										onClick={handleReset}
									>
										{state.currentStep === 6 ? (
											<>
												Start over
												<Icon as={FiArrowRight} height="16px" width="16px" />
											</>
										) : (
											'Reset'
										)}
									</Button>
								)}
							</HStack>
						</Card.Header>
						{state.currentStep !== 6 && (
							<Card.Body gap={5} minHeight="20rem">
								{/* Step content */}
								{state.currentStep === 1 && (
									<Stack gap={4}>
										<Tabs.Root
											fitted
											variant="enclosed"
											value={state.sourceType}
											onValueChange={(e) => {
												const v = e.value as SourceType;
												setState((prev) => ({
													...prev,
													sourceType: v,
													...(v === 'url'
														? { sourceFilePath: '', sourceFile: null }
														: { url: '' }),
													status: '',
												}));
											}}
										>
											<Tabs.List>
												<Tabs.Trigger
													value="url"
													disabled={!!(state.sourceFilePath || state.sourceFile)}
												>
													Enter URL
												</Tabs.Trigger>
												<Tabs.Trigger value="file" disabled={!!state.url.trim()}>
													Upload file
												</Tabs.Trigger>
											</Tabs.List>
											<Tabs.Content value="url">
												<Field.Root mt={4}>
													<Input
														id="url"
														type="url"
														placeholder="https://example.com/video or paste a link"
														value={state.url}
														onKeyDown={(e) => {
															if (e.key === 'Enter') {
																e.preventDefault();
																handleNext();
															}
														}}
														onChange={(e) =>
															setState((prev) => ({
																...prev,
																url: e.target.value,
																titleTouched: false,
																...(e.target.value.trim()
																	? {}
																	: {
																			durationSeconds: null,
																			endInput: '',
																			endSeconds: null,
																			startInput: '00:00:00',
																			startSeconds: 0,
																			title: '',
																			titleTouched: false,
																		}),
															}))
														}
													/>
												</Field.Root>
												<Text mt={2} fontSize="xs" color="fg.subtle">
													Only download content you have the right to use. You are responsible
													for complying with each site's terms of service and applicable laws.
												</Text>
											</Tabs.Content>
											<Tabs.Content value="file">
												<Box mt={4}>
													{typeof window.electronAPI?.openFileDialog === 'function' ? (
														<Button
															variant="outline"
															width="100%"
															onClick={async () => {
																const api = window.electronAPI;
																if (!api?.openFileDialog) return;
																setState((prev) => ({ ...prev, status: '' }));
																try {
																	const { path: selectedPath } =
																		await api.openFileDialog();
																	if (selectedPath) {
																		setState((prev) => ({
																			...prev,
																			sourceFilePath: selectedPath,
																			sourceFile: null,
																			status: '',
																		}));
																	}
																} catch (err) {
																	setState((prev) => ({
																		...prev,
																		status:
																			err instanceof Error
																				? err.message
																				: String(err),
																	}));
																}
															}}
														>
															{state.sourceFile?.name ??
																(state.sourceFilePath
																	? state.sourceFilePath.split(/[/\\]/).pop()
																	: null) ??
																'Choose MP4 file…'}
														</Button>
													) : (
														<>
															<input
																type="file"
																accept=".mp3,.mp4,audio/mpeg,video/mp4"
																style={{
																	position: 'absolute',
																	opacity: 0,
																	width: 0,
																	height: 0,
																}}
																id="file-input"
																onChange={(e) => {
																	const file = e.target.files?.[0];
																	if (file) {
																		setState((prev) => ({
																			...prev,
																			sourceFile: file,
																			sourceFilePath: '',
																			status: '',
																		}));
																	}
																	e.target.value = '';
																}}
															/>
															<Button
																variant="outline"
																width="100%"
																onClick={() =>
																	document.getElementById('file-input')?.click()
																}
															>
																{state.sourceFile?.name ??
																	(state.sourceFilePath
																		? state.sourceFilePath.split(/[/\\]/).pop()
																		: null) ??
																	'Choose MP4 file…'}
															</Button>
														</>
													)}
												</Box>
											</Tabs.Content>
										</Tabs.Root>
									</Stack>
								)}

								{state.currentStep === 2 && (
									<Stack gap={4}>
										<Field.Root>
											<Input
												id="title"
												placeholder="Video title..."
												value={state.title}
												aria-label="Title"
												onKeyDown={(e) => {
													if (e.key === 'Enter') {
														e.preventDefault();
														handleNext();
													}
												}}
												onChange={(e) =>
													setState((prev) => ({
														...prev,
														title: e.target.value,
														titleTouched: true,
													}))
												}
											/>
										</Field.Root>
									</Stack>
								)}

								{state.currentStep === 3 && (
									<Stack gap={4}>
										{hasSource ? (
											<>
												<HStack gap={6}>
													<Field.Root disabled={formDisabled}>
														<Field.Label>Start</Field.Label>
														<Input
															id="trim-start"
															value={state.startInput}
															disabled={formDisabled}
															onKeyDown={(e) => {
																if (e.key === 'Enter') {
																	e.preventDefault();
																	handleNext();
																}
															}}
															onChange={(e) => {
																if (formDisabled) return;
																const value = e.target.value;
																const secs = timeToSeconds(value);
																if (secs == null || secs < 0 || secs > effectiveDur) {
																	setState((prev) => ({
																		...prev,
																		startInput: value,
																		status: '',
																	}));
																	return;
																}
																if (secs >= effectiveEndVal) {
																	setState((prev) => ({
																		...prev,
																		status: 'Start must be before end.',
																	}));
																	return;
																}
																setState((prev) => ({
																	...prev,
																	startInput: value,
																	startSeconds: secs,
																	status: '',
																}));
															}}
														/>
													</Field.Root>
													<Field.Root disabled={formDisabled}>
														<Field.Label>End</Field.Label>
														<Input
															id="trim-end"
															value={state.endInput}
															disabled={formDisabled}
															onKeyDown={(e) => {
																if (e.key === 'Enter') {
																	e.preventDefault();
																	handleNext();
																}
															}}
															onChange={(e) => {
																if (formDisabled) return;
																const value = e.target.value;
																const secs = timeToSeconds(value);
																if (secs == null || secs < 0 || secs > effectiveDur) {
																	setState((prev) => ({
																		...prev,
																		endInput: value,
																		status: '',
																	}));
																	return;
																}
																if (secs <= state.startSeconds) {
																	setState((prev) => ({
																		...prev,
																		status: 'End must be after start.',
																	}));
																	return;
																}
																setState((prev) => ({
																	...prev,
																	endInput: value,
																	endSeconds: secs,
																	status: '',
																}));
															}}
														/>
													</Field.Root>
												</HStack>
												{effectiveDur > 0 && (
													<Slider.Root
														key={effectiveDur}
														min={0}
														max={effectiveDur}
														step={0.1}
														minStepsBetweenThumbs={1}
														value={[state.startSeconds, effectiveEndVal]}
														onValueChange={(details) => {
															const v = details.value;
															if (Array.isArray(v) && v.length >= 2) {
																const [s, end] = v;
																if (
																	typeof s === 'number' &&
																	typeof end === 'number' &&
																	s < end
																) {
																	setState((prev) => ({
																		...prev,
																		endInput: secondsToTime(end),
																		endSeconds: end,
																		startInput: secondsToTime(s),
																		startSeconds: s,
																	}));
																}
															}
														}}
													>
														<Slider.Control>
															<Slider.Track>
																<Slider.Range />
															</Slider.Track>
															<Slider.Thumbs />
														</Slider.Control>
													</Slider.Root>
												)}
											</>
										) : (
											<Text>
												Enter a valid URL or choose a file in step 1 to get the duration, then
												you'll be able to trim.
											</Text>
										)}
									</Stack>
								)}

								{state.currentStep === 4 && (
									<Stack gap={4}>
										<Field.Root>
											<HStack justify="space-between">
												<Field.Label>Speed</Field.Label>
												<Text fontSize="sm" color="fg.muted">
													{state.playbackSpeed.toFixed(2)}×
												</Text>
											</HStack>
											<Slider.Root
												min={0.25}
												max={2}
												step={0.25}
												value={[state.playbackSpeed]}
												onValueChange={(details) => {
													const raw = details.value;
													const v = Array.isArray(raw) ? raw[0] : raw;
													if (typeof v === 'number' && !Number.isNaN(v)) {
														setState((prev) => ({ ...prev, playbackSpeed: v }));
													}
												}}
												width="100%"
											>
												<Slider.Control>
													<Slider.Track>
														<Slider.Range />
													</Slider.Track>
													<Slider.Thumb index={0} />
												</Slider.Control>
											</Slider.Root>
										</Field.Root>
									</Stack>
								)}

								{state.currentStep === 5 && (
									<VStack gap={4} justify="center">
										<Spinner size="xl" />
										<Text textAlign="center">
											{state.processingPhase === 'converting' ? 'Converting…' : 'Downloading…'}
										</Text>
										<Alert.Root status="warning" variant="subtle">
											<Alert.Content>Please keep the app open while we work on it.</Alert.Content>
										</Alert.Root>
									</VStack>
								)}

								{state.status && (
									<Alert.Root
										status={
											state.status.includes('Error') ||
											state.status.includes("couldn't be reached") ||
											state.status.includes('Could not read')
												? 'error'
												: 'warning'
										}
										variant="subtle"
									>
										<Alert.Content>
											<Alert.Description>{state.status}</Alert.Description>
										</Alert.Content>
									</Alert.Root>
								)}
							</Card.Body>
						)}

						{state.currentStep <= 4 && (
							<Card.Footer>
								<HStack justify="flex-end" flexWrap="wrap" gap={2} width="100%">
									{state.currentStep > 1 && (
										<Button
											variant="outline"
											disabled={state.isLoading}
											onClick={() =>
												setState((prev) => ({ ...prev, currentStep: prev.currentStep - 1 }))
											}
										>
											Back
										</Button>
									)}
									<Button
										disabled={
											state.isLoading ||
											(state.currentStep === 1 && state.isFetchingVideoInfo) ||
											state.currentStep >= TOTAL_STEPS ||
											!hasSource
										}
										onClick={handleNext}
										loading={state.currentStep === 1 && state.isFetchingVideoInfo}
										flexShrink={0}
									>
										Continue
									</Button>
								</HStack>
							</Card.Footer>
						)}
					</Card.Root>
					{state.currentStep === 6 &&
						(state.lastDownloadPath && window.electronAPI?.showItemInFolder ? (
							<Button
								onClick={() => {
									const api = window.electronAPI;
									if (api?.showItemInFolder && state.lastDownloadPath) {
										api.showItemInFolder(state.lastDownloadPath);
									}
								}}
								width="100%"
							>
								Show in Finder
							</Button>
						) : typeof window !== 'undefined' && !window.electronAPI ? (
							<Button onClick={handleReset} width="100%">
								Show in Finder
							</Button>
						) : null)}
				</Stack>
			</AbsoluteCenter>
		</Box>
	);
}
