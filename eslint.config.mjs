import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
	js.configs.recommended,
	...tseslint.configs.recommended,
	eslintConfigPrettier,
	{
		files: ['src/**/*.{ts,tsx}'],
		languageOptions: {
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				project: ['./tsconfig.app.json'],
			},
			globals: {
				...globals.browser,
			},
		},
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/no-non-null-assertion': 'warn',
			'no-console': ['warn', { allow: ['warn', 'error'] }],
		},
	},
	{
		files: ['main.ts', 'preload.ts', 'theme.ts'],
		languageOptions: {
			parserOptions: {
				project: ['./tsconfig.json'],
			},
			globals: {
				...globals.node,
			},
		},
		rules: {
			'@typescript-eslint/no-require-imports': 'off',
		},
	},
	{
		ignores: ['dist/**', 'node_modules/**', 'build/**', 'bin/**', 'scripts/**', 'main.js', 'preload.js', 'theme.js', 'vite.config.ts', 'vite.config.mts'],
	}
);
