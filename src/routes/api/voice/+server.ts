import { json } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { customer, customerAlias, product, productAlias } from '#lib/server/db/schema.js';
import { SarvamError, sarvamConfigured } from '#lib/server/sarvam/client.js';
import { transcribeStrict } from '#lib/server/sarvam/stt.js';
import { getShop } from '#lib/server/shop.js';
import { buildDraft } from '#lib/server/voice/draft.js';
import { extractIntent } from '#lib/server/voice/extract.js';
import { findDues } from '#lib/server/ledger.js';
import type { Language } from '#lib/languages.js';
import { composeDuesAnswer } from '#lib/voice-answer.js';
import type { Draft, VoiceAnswer } from '#lib/voice-types.js';
import type { RequestHandler } from './$types';

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

/**
 * Answers a dues query from the ledger. Only when the customer is resolved (or nobody was named);
 * an ambiguous/new customer is returned as a draft with issues and no answer.
 */
async function dueAnswer(draft: Draft, language: Language): Promise<VoiceAnswer | undefined> {
	if (draft.intent !== 'query') return undefined;
	const c = draft.customer;
	if (c && c.status !== 'matched') return undefined;
	const { total, customers } = await findDues(c?.match?.id);
	const customerName = c?.match?.name ?? null;
	return { text: composeDuesAnswer(language, { customerName, total, customers }), total, customers };
}

function withAliases<T extends { id: string }>(rows: T[], aliases: { ownerId: string; alias: string }[]) {
	return rows.map((r) => ({
		...r,
		aliases: aliases.filter((a) => a.ownerId === r.id).map((a) => a.alias)
	}));
}

export const POST: RequestHandler = async ({ request, url }) => {
	const answerMode = url.searchParams.get('mode') === 'answer';
	const shop = await getShop();
	if (!shop) return json({ error: { code: 'no_shop' } }, { status: 400 });
	if (!sarvamConfigured()) return json({ error: { code: 'missing_api_key' } }, { status: 503 });

	const audio = (await request.formData()).get('audio');
	if (!(audio instanceof Blob) || audio.size === 0) {
		return json({ error: { code: 'no_audio' } }, { status: 400 });
	}
	if (audio.size > MAX_AUDIO_BYTES) return json({ error: { code: 'audio_too_large' } }, { status: 413 });

	const [customers, customerAliases, products, productAliases] = await Promise.all([
		db.select().from(customer),
		db.select().from(customerAlias),
		db.select().from(product),
		db.select().from(productAlias)
	]);
	const ctx = {
		customers: withAliases(
			customers,
			customerAliases.map((a) => ({ ownerId: a.customerId, alias: a.alias }))
		),
		products: withAliases(
			products,
			productAliases.map((a) => ({ ownerId: a.productId, alias: a.alias }))
		)
	};

	try {
		const { transcript } = await transcribeStrict(audio, {
			language: shop.language,
			keyterms: [...customers.map((c) => c.name), ...products.map((p) => p.name)]
		});
		// ?mode=answer: a reply to a clarification question. STT only; the client interprets it.
		if (answerMode) return json({ transcript });
		if (!transcript.trim()) return json({ draft: null });

		const intent = await extractIntent(transcript, {
			language: shop.language,
			customers: customers.map((c) => c.name),
			products: products.map((p) => p.name)
		});
		const draft = buildDraft(transcript, intent, ctx);
		return json({ draft, answer: await dueAnswer(draft, shop.language) });
	} catch (e) {
		if (e instanceof SarvamError) {
			console.error('[sarvam]', e.status, e.code, e.message, e.requestId);
			return json({ error: { code: e.code ?? 'sarvam_error', message: e.message } }, { status: 502 });
		}
		throw e;
	}
};
