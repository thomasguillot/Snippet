const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
	getVideoInfo: (url) => ipcRenderer.invoke('get-video-info', { url }),
	downloadMP3: (params) => ipcRenderer.invoke('download-mp3', params),
});
