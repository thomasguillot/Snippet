import { Provider } from '@/components/ui/provider';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app';

const rootEl = document.getElementById('root');
if (rootEl) {
	ReactDOM.createRoot(rootEl).render(
		<React.StrictMode>
			<Provider>
				<App />
			</Provider>
		</React.StrictMode>
	);
}
