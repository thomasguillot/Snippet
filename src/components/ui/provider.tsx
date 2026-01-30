import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import React, { type ReactNode } from 'react';
import { ColorModeProvider } from './color-mode';

interface ProviderProps {
	children: ReactNode;
}

export function Provider(props: ProviderProps) {
	const { children } = props;
	return (
		<ChakraProvider value={defaultSystem}>
			<ColorModeProvider>{children}</ColorModeProvider>
		</ChakraProvider>
	);
}
