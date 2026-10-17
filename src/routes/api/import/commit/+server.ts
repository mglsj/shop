import { json } from '@sveltejs/kit';
import { badRequest, readBody } from '#lib/server/api.js';
import { db } from '#lib/server/db/index.js';
import { customer, customerAlias } from '#lib/server/db/schema.js';
import { commit, createCustomer, listBalances } from '#lib/server/ledger.js';
import { commitRows } from './commit-rows.js';
import type { RequestHandler } from './$types';

const MAX_ROWS = 500;

export const POST: RequestHandler = async ({ request }) => {
	const body = await readBody(request);
	if (!body || !Array.isArray(body.rows)) return badRequest('bad_json', 'rows array required');
	if (body.rows.length > MAX_ROWS) return badRequest('too_many_rows', `at most ${MAX_ROWS} rows`);

	const rows: { name: string; amount: number }[] = [];
	for (const r of body.rows as unknown[]) {
		const o = r as { name?: unknown; amount?: unknown } | null;
		const name = typeof o?.name === 'string' ? o.name.trim() : '';
		const amount = typeof o?.amount === 'number' ? o.amount : Number.NaN;
		if (!name || !Number.isFinite(amount) || amount < 0) {
			return badRequest('invalid_row', 'each row needs a name and a non-negative amount');
		}
		rows.push({ name, amount: Math.round(amount * 100) / 100 });
	}

	const [customers, aliases, balances] = await Promise.all([
		db.select().from(customer),
		db.select().from(customerAlias),
		listBalances()
	]);
	const pool = customers.map((c) => ({
		id: c.id,
		name: c.name,
		aliases: aliases.filter((a) => a.customerId === c.id).map((a) => a.alias)
	}));

	return json(await commitRows(rows, { pool, balances, createCustomer, commit }));
};
