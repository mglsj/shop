import { json } from '@sveltejs/kit';
import { badRequest, guarded, readBody } from '#lib/server/api.js';
import { undo } from '#lib/server/ledger.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await readBody(request);
	if (!body) return badRequest('bad_json', 'body must be a JSON object');
	if (typeof body.txnId !== 'string' || !body.txnId) return badRequest('invalid_txn', 'txnId required');
	const txnId = body.txnId;
	return guarded(async () => json(await undo(txnId)));
};
