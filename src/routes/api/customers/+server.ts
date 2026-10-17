import { json } from '@sveltejs/kit';
import { badRequest, guarded, readBody } from '#lib/server/api.js';
import { addCustomerAlias, createCustomer, listBalances } from '#lib/server/ledger.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json(await listBalances());

export const POST: RequestHandler = async ({ request }) => {
	const body = await readBody(request);
	if (!body) return badRequest('bad_json', 'body must be a JSON object');
	if (typeof body.name !== 'string' || !body.name.trim()) return badRequest('invalid_name', 'name required');
	if (body.phone != null && typeof body.phone !== 'string') return badRequest('invalid_phone', 'phone must be a string');
	if (body.aliasOf != null && typeof body.aliasOf !== 'string') {
		return badRequest('invalid_alias_of', 'aliasOf must be a customer id');
	}
	const { name, phone, aliasOf } = body as { name: string; phone?: string | null; aliasOf?: string | null };
	return guarded(async () =>
		json({ customer: aliasOf ? await addCustomerAlias(aliasOf, name) : await createCustomer({ name, phone }) })
	);
};
