// Client-only: plays Sarvam TTS through one shared audio element.

let shared: HTMLAudioElement | null = null;
let pending: (() => void) | null = null;

/** Stops current playback and resolves the pending speak() call, if any. */
export function stopSpeaking(): void {
	try {
		shared?.pause();
	} catch {
		// ignore
	}
	const done = pending;
	pending = null;
	done?.();
}

/** Fetches speech for `text` and plays it. Resolves when playback ends or fails; never throws. */
export async function speak(text: string): Promise<void> {
	try {
		stopSpeaking();
		const res = await fetch('/api/tts', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ text })
		});
		if (!res.ok) return;

		const url = URL.createObjectURL(await res.blob());
		const audio = (shared ??= new Audio());

		await new Promise<void>((resolve) => {
			const finish = () => {
				audio.onended = null;
				audio.onerror = null;
				URL.revokeObjectURL(url);
				if (pending === finish) pending = null;
				resolve();
			};
			pending = finish;
			audio.onended = finish;
			audio.onerror = finish;
			audio.src = url;
			audio.play().catch(finish);
		});
	} catch {
		// swallow: autoplay blocked, network error, etc.
	}
}
