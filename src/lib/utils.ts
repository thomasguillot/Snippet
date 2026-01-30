export function timeToSeconds(timeStr: string | undefined): number | null {
	if (!timeStr || typeof timeStr !== 'string') return null;
	const parts = timeStr.split(':').map((p) => Number(p));
	if (parts.some((p) => Number.isNaN(p))) return null;
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	return null;
}

export function secondsToTime(seconds: number): string {
	if (!seconds || Number.isNaN(seconds)) return '00:00:00';
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function tryMediaDuration(url: string, useVideo: boolean): Promise<number | null> {
	return new Promise((resolve) => {
		const media = useVideo ? document.createElement('video') : document.createElement('audio');
		media.preload = 'metadata';
		media.style.position = 'absolute';
		media.style.left = '-9999px';
		media.style.visibility = 'hidden';

		let settled = false;
		const done = (duration: number | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			media.remove();
			resolve(duration);
		};

		const timeoutId = setTimeout(() => done(null), 10000);

		media.addEventListener('loadedmetadata', () => {
			const d = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : null;
			done(d);
		});
		media.addEventListener('error', () => done(null));
		media.addEventListener('durationchange', () => {
			if (Number.isFinite(media.duration) && media.duration > 0) {
				done(media.duration);
			}
		});

		document.body.appendChild(media);
		media.src = url;
	});
}

export async function getLocalFileInfoFromFile(file: File): Promise<{ duration: number | null; title: string }> {
	const url = URL.createObjectURL(file);
	const title = file.name.replace(/\.[^.]+$/, '') || 'audio';
	try {
		const isVideo = file.type.startsWith('video/') || /\.mp4$/i.test(file.name);
		let duration = await tryMediaDuration(url, isVideo);
		if (duration == null && isVideo) {
			duration = await tryMediaDuration(url, false);
		} else if (duration == null && !isVideo) {
			duration = await tryMediaDuration(url, true);
		}
		return { duration, title };
	} finally {
		URL.revokeObjectURL(url);
	}
}
