import type { Draft, DraftItem } from '#lib/voice-types.js';
import { recompute } from '#lib/voice-draft.js';
import type { Intent } from './intent.js';
import { resolveEntity, type Candidate } from './match.js';

export type DraftContext = {
	customers: Candidate[];
	products: (Candidate & { defaultPrice?: number | null })[];
};

/**
 * Pure: turns a model intent + known entities into a draft. Writes nothing; money math and
 * issue detection live in #lib/voice-draft.ts so the client recomputes identically after edits.
 */
export function buildDraft(transcript: string, intent: Intent, ctx: DraftContext): Draft {
	const base: Draft = {
		transcript,
		intent: 'unknown',
		customer: null,
		items: [],
		amount: null,
		statedTotal: null,
		paymentMode: 'unknown',
		issues: [],
		question: null
	};

	const customerFor = (name: string | null) => (name ? resolveEntity(name, ctx.customers) : null);

	switch (intent.kind) {
		case 'clarify':
			return { ...base, intent: 'clarify', question: intent.question };
		case 'unknown':
			return base;
		case 'query':
			return recompute({ ...base, intent: 'query', customer: customerFor(intent.customerName) });
		case 'payment':
			return recompute({
				...base,
				intent: 'payment',
				customer: customerFor(intent.customerName),
				amount: intent.amount,
				paymentMode: 'cash'
			});
		case 'sale': {
			const items: DraftItem[] = intent.items.map((it) => {
				const product = resolveEntity(it.name, ctx.products);
				const defaultPrice = ctx.products.find((p) => p.id === product.match?.id)?.defaultPrice;
				return {
					spoken: it.name,
					qty: it.qty,
					unit: it.unit,
					unitPrice: it.unitPrice ?? defaultPrice ?? null,
					product
				};
			});
			return recompute({
				...base,
				intent: 'sale',
				customer: customerFor(intent.customerName),
				items,
				statedTotal: intent.totalAmount,
				paymentMode: intent.paymentMode
			});
		}
	}
}
