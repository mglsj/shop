import { json } from '@sveltejs/kit';
import { SarvamError, sarvamConfigured } from '#lib/server/sarvam/client.js';
import { synthesize } from '#lib/server/sarvam/tts.js';
import { getShop } from '#lib/server/shop.js';
import type { Language } from '#lib/languages.js';
import type { RequestHandler } from './$types';

const MAX_TEXT_CHARS = 500;
const CACHE_MAX = 50;

/** Tiny LRU: Map keeps insertion order, so re-inserting on hit moves an entry to the back. */
const cache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
	const hit = cache.get(key);
	if (hit !== undefined) {
		cache.delete(key);
		cache.set(key, hit);
	}
	return hit;
}

function cacheSet(key: string, value: string) {
	cache.delete(key);
	cache.set(key, value);
	if (cache.size > CACHE_MAX) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const text = typeof body?.text === 'string' ? body.text.trim() : '';
	if (!text || text.length > MAX_TEXT_CHARS) {
		return json({ error: { code: 'invalid_text' } }, { status: 400 });
	}

	const shop = await getShop();
	if (!shop) return json({ error: { code: 'no_shop' } }, { status: 400 });
	if (!sarvamConfigured()) return json({ error: { code: 'missing_api_key' } }, { status: 503 });

	const language: Language = shop.language;
	const key = `${language}\n${text}`;
	const headers = {
		'Content-Type': 'audio/mpeg',
		'Cache-Control': 'private, max-age=3600'
	};

	const cached = cacheGet(key);
	if (cached !== undefined) {
		return new Response(Buffer.from(cached, 'base64'), { headers });
	}

	try {
		const { audioBase64 } = await synthesize(text, language);
		cacheSet(key, audioBase64);
		return new Response(Buffer.from(audioBase64, 'base64'), { headers });
	} catch (e) {
		if (e instanceof SarvamError) {
			console.error('[sarvam]', e.status, e.code, e.message, e.requestId);
			return json({ error: { code: e.code ?? 'sarvam_error', message: e.message } }, { status: 502 });
		}
		throw e;
	}
};
