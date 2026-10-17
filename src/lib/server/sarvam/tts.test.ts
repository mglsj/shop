import { describe, expect, test } from 'bun:test';
import { buildTtsBody, TTS_MAX_CHARS } from './tts-body.js';

describe('buildTtsBody', () => {
	test('uses language_code and the documented voice settings', () => {
		const body = buildTtsBody('namaste', 'hi-IN');
		expect(body).toEqual({
			text: 'namaste',
			language_code: 'hi-IN',
			speaker: 'shubh',
			model: 'bulbul:v3',
			pace: 1.0,
			speech_sample_rate: 22050,
			output_audio_codec: 'mp3'
		});
		expect('target_language_code' in body).toBe(false);
	});

	test('truncates text to the Sarvam limit', () => {
		const body = buildTtsBody('a'.repeat(TTS_MAX_CHARS + 100), 'en-IN');
		expect(body.text.length).toBe(TTS_MAX_CHARS);
	});
});
