import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
	base: './',
	build: {
		emptyOutDir: true,
		outDir: 'dist',
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
});
