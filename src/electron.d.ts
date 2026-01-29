export interface ElectronAPI {
	getVideoInfo: (url: string) => Promise<{ duration?: number; title?: string }>;
	openFileDialog: () => Promise<{ path: string | null }>;
	getLocalFileInfo: (filePath: string) => Promise<{ duration: number | null; title: string }>;
	downloadMP3: (params: {
		url?: string;
		sourceFilePath?: string;
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
