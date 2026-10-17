// Pure and client-safe: shared by the server (draft.ts) and the draft card so edits recompute identically.
import type { CommitInput, CommitItem } from '#lib/ledger-types.js';
import type { Draft, DraftIssue, EntityResolution, PaymentMode } from '#lib/voice-types.js';

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Recomputes `amount` and `issues` from the rest of the draft. Never mutates. */
export function recompute(draft: Draft): Draft {
	if (draft.intent === 'clarify' || draft.intent === 'unknown') return { ...draft, issues: [] };

	let amount = draft.amount;
	if (draft.intent === 'sale') {
		const allPriced = draft.items.length > 0 && draft.items.every((i) => i.unitPrice != null);
		amount = allPriced
			? round2(draft.items.reduce((sum, i) => sum + i.qty * i.unitPrice!, 0))
			: (draft.statedTotal ?? null);
	}

	const issues: DraftIssue[] = [];
	const c = draft.customer;
	if (c?.status === 'new') issues.push('customer_new');
	else if (c?.status === 'ambiguous') issues.push('customer_ambiguous');

	if (draft.intent === 'sale' && draft.paymentMode === 'unknown') issues.push('payment_mode');
	const needsCustomer =
		draft.intent === 'payment' || (draft.intent === 'sale' && draft.paymentMode === 'tab');
	if (needsCustomer && !c) issues.push('customer_required');
	if (draft.intent !== 'query' && (amount == null || amount <= 0)) issues.push('amount_missing');
	if (draft.intent === 'sale' && draft.items.some((i) => i.product.status === 'new')) {
		issues.push('product_new');
	}
	return { ...draft, amount, issues };
}

/** product_new is informational; every other issue must be resolved before confirming. */
export const isBlocking = (issue: DraftIssue) => issue !== 'product_new';

export function blockingIssues(draft: Draft): DraftIssue[] {
	return draft.issues.filter(isBlocking);
}

/**
 * The question to ask next, or null. A query about an unknown customer has nothing to
 * clarify (it is answered with "not found"), so it never becomes a question.
 */
export function nextIssue(draft: Draft): DraftIssue | null {
	if (draft.intent === 'query' && draft.customer?.status === 'new') return null;
	return blockingIssues(draft)[0] ?? null;
}

export const setPaymentMode = (draft: Draft, paymentMode: PaymentMode): Draft =>
	recompute({ ...draft, paymentMode });

export const setCustomer = (draft: Draft, customer: EntityResolution | null): Draft =>
	recompute({ ...draft, customer });

/** Marks the customer as a confirmed, existing person. */
export function setMatchedCustomer(draft: Draft, who: { id: string; name: string }): Draft {
	return setCustomer(draft, {
		spoken: draft.customer?.spoken ?? who.name,
		status: 'matched',
		match: { id: who.id, name: who.name, score: 1 },
		candidates: []
	});
}

export function setItemPrice(draft: Draft, index: number, unitPrice: number | null): Draft {
	const items = draft.items.map((it, i) => (i === index ? { ...it, unitPrice } : it));
	return recompute({ ...draft, items });
}

/** Sale: the stated total (used while items are unpriced). Payment: the amount itself. */
export function setAmount(draft: Draft, value: number | null): Draft {
	return draft.intent === 'sale'
		? recompute({ ...draft, statedTotal: value })
		: recompute({ ...draft, amount: value });
}

/**
 * Builds the commit payload, or null while blocking issues remain.
 *
 * Pricing: when every item has a unit price the lines are sent as-is. Otherwise `amount`
 * is the stated total, and
 *  - exactly one unpriced item: its unit price is derived from (total - priced lines) / qty;
 *  - several unpriced items (or nothing left over): the whole sale is sent as ONE synthetic
 *    line "name1, name2" (qty 1, unitPrice = total). It always passes the server's sum check.
 */
export function buildCommitInput(draft: Draft): CommitInput | null {
	if (blockingIssues(draft).length) return null;
	const amount = draft.amount;
	if (amount == null || amount <= 0) return null;
	const transcript = draft.transcript || undefined;
	const customerId = draft.customer?.status === 'matched' ? (draft.customer.match?.id ?? null) : null;

	if (draft.intent === 'payment') {
		return customerId ? { kind: 'payment', customerId, amount, transcript } : null;
	}
	if (draft.intent !== 'sale' || draft.items.length === 0) return null;
	if (draft.paymentMode !== 'cash' && draft.paymentMode !== 'tab') return null;

	const base = draft.items.map((it) => ({
		productId: it.product.match?.id ?? null,
		name: it.product.match?.name ?? it.spoken,
		qty: it.qty,
		unit: it.unit
	}));
	const unpriced = draft.items.flatMap((it, i) => (it.unitPrice == null ? [i] : []));

	let items: CommitItem[];
	if (unpriced.length === 0) {
		items = base.map((b, i) => ({ ...b, unitPrice: draft.items[i].unitPrice! }));
	} else {
		const pricedSum = draft.items.reduce((s, it) => s + (it.unitPrice == null ? 0 : it.qty * it.unitPrice), 0);
		const remainder = round2(amount - pricedSum);
		if (unpriced.length === 1 && remainder > 0) {
			items = base.map((b, i) => ({
				...b,
				unitPrice: i === unpriced[0] ? Math.round((remainder / b.qty) * 1e4) / 1e4 : draft.items[i].unitPrice!
			}));
		} else {
			items = [
				{ productId: null, name: base.map((b) => b.name).join(', '), qty: 1, unit: null, unitPrice: amount }
			];
		}
	}
	return { kind: 'sale', customerId, paymentMode: draft.paymentMode, items, amount, transcript };
}
