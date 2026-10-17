import type { Language } from '#lib/languages.js';

/** bulbul:v3 accepts up to 2500 characters per request. */
export const TTS_MAX_CHARS = 2500;

/** Pure request-body builder for Sarvam POST /text-to-speech (kept free of server-only imports). */
export function buildTtsBody(text: string, language: Language) {
	return {
		text: text.slice(0, TTS_MAX_CHARS),
		language_code: language,
		speaker: 'shubh',
		model: 'bulbul:v3',
		pace: 1.0,
		speech_sample_rate: 22050,
		output_audio_codec: 'mp3'
	} as const;
}
