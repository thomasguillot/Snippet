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
	Progress,
	Slider,
	Stack,
	Tabs,
	Text,
} from '@chakra-ui/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getLocalFileInfoFromFile, secondsToTime, timeToSeconds } from '@/lib/utils';
import { FiArrowRight } from 'react-icons/fi';

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
};

async function fetchVideoInfo(urlToFetch: string): Promise<{ duration?: number; title?: string }> {
	if (!urlToFetch?.trim()) return {};
	const api = window.electronAPI;
	if (!api?.getVideoInfo) return {};
	return api.getVideoInfo(urlToFetch.trim());
}

export function App() {
	const [state, setState] = useState<State>(initialState);
	const fetchInfoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
					const next = { ...prev };
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
			}
			fetchInfoTimeoutRef.current = null;
		}, 500);
		return () => {
			if (fetchInfoTimeoutRef.current) clearTimeout(fetchInfoTimeoutRef.current);
		};
	}, [state.sourceType, state.url]);

	const runDownload = useCallback(async () => {
		setState((prev) => ({ ...prev, status: '', isLoading: true, currentStep: 5 }));
		if (state.sourceType === 'file' && state.sourceFile != null) {
			setState((prev) => ({
				...prev,
				status: 'Conversion and download are only available in the desktop app. Run: npm run dev',
				isLoading: false,
				currentStep: 4,
			}));
			return;
		}
		const api = window.electronAPI;
		if (!api?.downloadMP3) {
			setState((prev) => ({ ...prev, status: 'Error: App not ready', isLoading: false, currentStep: 4 }));
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
			setState((prev) => ({ ...prev, currentStep: 6, maxStepReached: 6, isLoading: false }));
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setState((prev) => ({ ...prev, status: `Error: ${message}`, currentStep: 4, isLoading: false }));
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
				setState((prev) => ({
					...prev,
					status:
						prev.sourceType === 'url'
							? 'Could not fetch video info. Please check the URL.'
							: 'Could not read file. Please choose a valid MP4 file.',
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
			sourceType: state.currentStep === 1 ? state.sourceType : 'url',
		});
	}, [state.currentStep]);

	const hasSource =
		state.currentStep !== 1 ||
		(state.sourceType === 'url' && state.url.trim().length > 0) ||
		(state.sourceType === 'file' && (state.sourceFilePath.trim().length > 0 || state.sourceFile != null));
	const hasSourceToReset =
		state.url.trim().length > 0 || state.sourceFilePath.trim().length > 0 || state.sourceFile != null;
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
									title: 'Download complete!',
									description: 'Your MP3 has been downloaded successfully.',
								};

	return (
		<Box position="relative" minH="100vh" w="100%">
			<AbsoluteCenter axis="both" width="100%" maxW="512px" p={6}>
				<Card.Root width="100%" size="lg" variant="elevated">
					<Card.Header borderBottomWidth="1px" paddingBlock="3" paddingInline="3">
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
							{hasSourceToReset && (
								<Button
									size="xs"
									variant="ghost"
									colorPalette="red"
									disabled={state.isLoading}
									onClick={handleReset}
								>
									Reset
								</Button>
							)}
						</HStack>
					</Card.Header>
					<Card.Body gap={5}>
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
											...(v === 'url' ? { sourceFilePath: '', sourceFile: null } : { url: '' }),
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
											Only download content you have the right to use. You are responsible for
											complying with each site's terms of service and applicable laws.
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
															const { path: selectedPath } = await api.openFileDialog();
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
																	err instanceof Error ? err.message : String(err),
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
														onClick={() => document.getElementById('file-input')?.click()}
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
										{state.sourceType === 'file' && state.sourceFile != null && dur <= 0 && (
											<Alert.Root status="error">
												<Alert.Content>
													<Alert.Description>
														Duration couldn't be read from your file in the browser. Use the
														desktop app to trim, or continue to convert the full file. The
														form below is shown for reference but won't affect the output in
														the browser.
													</Alert.Description>
												</Alert.Content>
											</Alert.Root>
										)}
										<HStack gap={6}>
											<Field.Root disabled={formDisabled}>
												<Field.Label>Start</Field.Label>
												<Input
													id="trim-start"
													value={state.startInput}
													disabled={formDisabled}
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
										{state.sourceType === 'file' && state.sourceFile != null && dur <= 0 && (
											<Button
												variant="subtle"
												onClick={() =>
													setState((prev) => ({
														...prev,
														currentStep: 4,
														maxStepReached: Math.max(prev.maxStepReached, 4),
													}))
												}
												width="100%"
												justifyContent="space-between"
											>
												Continue without trimming
												<Icon as={FiArrowRight} marginStart={2} fontSize="1em" />
											</Button>
										)}
									</>
								) : (
									<Text>
										Enter a valid URL or choose a file in step 1 to get the duration, then you'll be
										able to trim.
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
							<Stack gap={4}>
								<Progress.Root value={null}>
									<Progress.Track>
										<Progress.Range />
									</Progress.Track>
								</Progress.Root>
								<Text fontSize="sm" color="fg.subtle">
									Please keep the app open while we work on it.
								</Text>
							</Stack>
						)}

						{state.currentStep === 6 && (
							<Stack gap={4} alignItems="center">
								<Box
									width="12"
									height="12"
									borderRadius="full"
									borderWidth="2px"
									borderColor="green.500"
									bg="green.500/10"
									position="relative"
								>
									<Box
										position="absolute"
										left="12px"
										top="18px"
										width="24px"
										height="16px"
										borderLeftWidth="3px"
										borderBottomWidth="3px"
										borderColor="green.500"
										transform="rotate(-45deg)"
									/>
								</Box>
								<Button onClick={handleReset}>Start over</Button>
							</Stack>
						)}

						{state.status && (
							<Text fontSize="sm" color={state.status.includes('Error') ? 'red.400' : 'fg.muted'}>
								{state.status}
							</Text>
						)}
					</Card.Body>

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
									loadingText="Loading…"
									flexShrink={0}
								>
									{nextLabel}
								</Button>
							</HStack>
						</Card.Footer>
					)}
				</Card.Root>
			</AbsoluteCenter>
		</Box>
	);
}
