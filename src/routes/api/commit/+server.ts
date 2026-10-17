import { json } from '@sveltejs/kit';
import type { CommitInput } from '#lib/ledger-types.js';
import { badRequest, guarded, readBody } from '#lib/server/api.js';
import { commit } from '#lib/server/ledger.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await readBody(request);
	if (!body) return badRequest('bad_json', 'body must be a JSON object');
	if (body.kind !== 'sale' && body.kind !== 'payment') {
		return badRequest('invalid_kind', 'kind must be sale or payment');
	}
	if (typeof body.amount !== 'number') return badRequest('invalid_amount', 'amount must be a number');
	if (body.customerId != null && typeof body.customerId !== 'string') {
		return badRequest('invalid_customer', 'customerId must be a string or null');
	}
	if (body.transcript != null && typeof body.transcript !== 'string') {
		return badRequest('invalid_transcript', 'transcript must be a string');
	}
	if (body.kind === 'sale') {
		if (!Array.isArray(body.items)) return badRequest('no_items', 'items must be an array');
		for (const it of body.items as Record<string, unknown>[]) {
			if (
				!it ||
				typeof it !== 'object' ||
				typeof it.name !== 'string' ||
				typeof it.qty !== 'number' ||
				typeof it.unitPrice !== 'number' ||
				(it.productId != null && typeof it.productId !== 'string') ||
				(it.unit != null && typeof it.unit !== 'string')
			) {
				return badRequest('invalid_item', 'each item needs name, qty, unitPrice');
			}
			it.productId ??= null;
			it.unit ??= null;
		}
		body.customerId ??= null;
	}
	return guarded(async () => json(await commit(body as unknown as CommitInput)));
};
