import type { Language } from '#lib/languages.js';
import { isHindiOrEnglish } from '#lib/script.js';
import { sarvamJson } from './client.js';

export type TranscribeResult = {
	request_id: string;
	transcript: string;
	language_code: string | null;
};

const EXTENSIONS: Record<string, string> = {
	'audio/webm': 'webm',
	'audio/ogg': 'ogg',
	'audio/mp4': 'mp4',
	'audio/mpeg': 'mp3',
	'audio/wav': 'wav',
	'audio/x-wav': 'wav'
};

/** REST speech-to-text; Sarvam limits this endpoint to clips under 30 seconds. */
export function transcribe(
	audio: Blob,
	opts: { language: Language; keyterms?: string[] }
): Promise<TranscribeResult> {
	const type = audio.type.split(';')[0] || 'audio/webm';
	const form = new FormData();
	form.set('file', new Blob([audio], { type }), `audio.${EXTENSIONS[type] ?? 'webm'}`);
	form.set('model', 'saaras:v4');
	// codemix keeps English shop words ("biscuit") readable inside Hindi speech
	form.set('mode', opts.language === 'hi-IN' ? 'codemix' : 'transcribe');
	form.set('language_code', opts.language);
	if (opts.keyterms?.length) {
		const terms = opts.keyterms.map((k) => k.slice(0, 64)).slice(0, 50);
		form.set('keyterms', JSON.stringify(terms));
	}
	return sarvamJson<TranscribeResult>('/speech-to-text', { form });
}

/**
 * Hindi + English only. Tries the shop language first; if the transcript comes back in another
 * script, retries once in the other supported language. Returns an empty transcript if both fail.
 */
export async function transcribeStrict(
	audio: Blob,
	opts: { language: Language; keyterms?: string[] }
): Promise<TranscribeResult> {
	const first = await transcribe(audio, opts);
	if (isHindiOrEnglish(first.transcript)) return first;

	const other: Language = opts.language === 'hi-IN' ? 'en-IN' : 'hi-IN';
	const second = await transcribe(audio, { ...opts, language: other });
	return isHindiOrEnglish(second.transcript) ? second : { ...second, transcript: '' };
}
