import { AbsoluteCenter, Box, ChakraProvider, defaultSystem, Progress } from '@chakra-ui/react';
import React, { type ReactNode, useEffect, useState } from 'react';
import { ColorModeProvider } from './color-mode';

const LOADER_MIN_MS = 2400;
const FADE_DURATION_MS = 125;

function LoaderProgress() {
	return (
		<AbsoluteCenter axis="both" width="100%" maxW="256px" px={6}>
			<Progress.Root value={null} variant="subtle" width="100%">
				<Progress.Track>
					<Progress.Range />
				</Progress.Track>
			</Progress.Root>
		</AbsoluteCenter>
	);
}

interface ProviderProps {
	children: ReactNode;
}

function MountLoader(props: { children: ReactNode }) {
	const { children } = props;
	const [mounted, setMounted] = useState(false);
	const [minDelayElapsed, setMinDelayElapsed] = useState(false);
	const [fadeOut, setFadeOut] = useState(false);
	const [fadeComplete, setFadeComplete] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		const id = setTimeout(() => setMinDelayElapsed(true), LOADER_MIN_MS);
		return () => clearTimeout(id);
	}, []);

	const ready = mounted && minDelayElapsed;

	useEffect(() => {
		if (!ready) return;
		const id = requestAnimationFrame(() => setFadeOut(true));
		return () => cancelAnimationFrame(id);
	}, [ready]);

	const handleTransitionEnd = (e: React.TransitionEvent) => {
		if (e.propertyName === 'opacity' && fadeOut) setFadeComplete(true);
	};

	if (!ready && !fadeComplete) {
		return (
			<Box
				bg="bg"
				height="100vh"
				position="fixed"
				width="100%"
				zIndex="banner"
				style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
			>
				<LoaderProgress />
			</Box>
		);
	}

	if (fadeComplete) {
		return <>{children}</>;
	}

	return (
		<>
			{children}
			<Box
				bg="bg"
				height="100vh"
				left={0}
				position="fixed"
				top={0}
				transition={`opacity ${FADE_DURATION_MS}ms ease-out`}
				width="100%"
				zIndex="banner"
				opacity={fadeOut ? 0 : 1}
				onTransitionEnd={handleTransitionEnd}
				pointerEvents={fadeOut ? 'none' : 'auto'}
			>
				<LoaderProgress />
			</Box>
		</>
	);
}

export function Provider(props: ProviderProps) {
	const { children } = props;
	return (
		<ChakraProvider value={defaultSystem}>
			<ColorModeProvider>
				<MountLoader>{children}</MountLoader>
			</ColorModeProvider>
		</ChakraProvider>
	);
}
