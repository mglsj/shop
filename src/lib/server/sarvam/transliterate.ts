import { sarvamJson } from './client.js';

/** Sarvam POST /transliterate. Codes like 'hi-IN', 'en-IN'; source may be 'auto'. */
export async function transliterate(
	input: string,
	source: string,
	target: string
): Promise<string> {
	const res = await sarvamJson<{ transliterated_text: string }>('/transliterate', {
		json: { input, source_language_code: source, target_language_code: target }
	});
	return res.transliterated_text;
}
