import { ThemeProvider } from 'next-themes';
import type { PropsWithChildren } from 'react';

/**
 * Wraps the app with next-themes ThemeProvider so Chakra semantic tokens
 * and _dark overrides follow system preference (prefers-color-scheme).
 * Uses attribute="class" so the html element gets class="dark" or class="light".
 */
export function ColorModeProvider(props: PropsWithChildren) {
	const { children } = props;
	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			{children}
		</ThemeProvider>
	);
}
