export interface ElectronAPI {
	getVideoInfo: (url: string) => Promise<{ duration?: number; title?: string }>;
	downloadMP3: (params: {
		url: string;
		title?: string | null;
		startTime?: number;
		endTime?: number | null;
		playbackSpeed?: number;
	}) => Promise<{ buffer: ArrayBuffer; filename: string }>;
}

declare global {
	interface Window {
		electronAPI?: ElectronAPI;
	}
}

export {};
