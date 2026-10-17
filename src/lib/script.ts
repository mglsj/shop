const ALLOWED = /^[\p{Script=Latin}\p{Script=Devanagari}]$/u;

/**
 * The app supports Hindi (Devanagari) and English (Latin) only. Speech models can still return
 * other Indian scripts (Urdu, Punjabi, ...) for noisy or mixed speech; those transcripts are rejected.
 */
export function isHindiOrEnglish(text: string): boolean {
	return (text.match(/\p{L}/gu) ?? []).every((ch) => ALLOWED.test(ch));
}
