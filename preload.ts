const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
	getVideoInfo: (url: unknown) => {
		if (typeof url !== 'string') {
			return Promise.reject(new Error('URL must be a string'));
		}
		return ipcRenderer.invoke('get-video-info', { url });
	},
	downloadMP3: (params: unknown) => {
		if (params == null || typeof params !== 'object' || Array.isArray(params)) {
			return Promise.reject(new Error('Params must be an object'));
		}
		const { url, title, startTime, endTime, playbackSpeed } = params as Record<string, unknown>;
		return ipcRenderer.invoke('download-mp3', {
			url: url != null ? url : undefined,
			title: title != null ? title : undefined,
			startTime: startTime != null ? startTime : undefined,
			endTime: endTime != null ? endTime : undefined,
			playbackSpeed: playbackSpeed != null ? playbackSpeed : undefined,
		});
	},
});
