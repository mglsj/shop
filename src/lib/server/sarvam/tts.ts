import type { Language } from '#lib/languages.js';
import { SarvamError, sarvamJson } from './client.js';
import { buildTtsBody } from './tts-body.js';

type TtsResponse = {
	request_id: string | null;
	audios: string[];
};

/** Text-to-speech via Sarvam; returns base64 audio (requested as mp3) for the first input. */
export async function synthesize(
	text: string,
	language: Language
): Promise<{ audioBase64: string; mime: string }> {
	const res = await sarvamJson<TtsResponse>('/text-to-speech', {
		json: buildTtsBody(text, language)
	});
	const audioBase64 = res.audios?.[0];
	if (!audioBase64) throw new SarvamError('Sarvam returned no audio', 502, 'empty_audio', res.request_id ?? undefined);
	return { audioBase64, mime: 'audio/mpeg' };
}
