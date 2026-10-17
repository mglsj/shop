import type { CommitInput, CommitResult, CustomerBalance } from '#lib/ledger-types.js';
import { resolveEntity, type Candidate } from '#lib/server/voice/match.js';

export const OPENING_ITEM_NAME = 'Old balance (notebook)';

export type CommitRowsDeps = {
	/** Existing customers with aliases for fuzzy matching. */
	pool: Candidate[];
	balances: CustomerBalance[];
	createCustomer: (input: { name: string }) => Promise<{ id: string; name: string }>;
	commit: (input: CommitInput) => Promise<CommitResult>;
};

export type CommitRowsResult = {
	created: number;
	updated: number;
	totalDue: number;
	skipped: { name: string; reason: 'already_imported' | 'exists_no_amount' }[];
	failed: { name: string; code: string }[];
};

export async function commitRows(rows: { name: string; amount: number }[], deps: CommitRowsDeps): Promise<CommitRowsResult> {
	const out: CommitRowsResult = { created: 0, updated: 0, totalDue: 0, skipped: [], failed: [] };
	const pool = [...deps.pool];
	const due = new Map(deps.balances.map((b) => [b.id, b.due]));

	for (const row of rows) {
		try {
			const res = resolveEntity(row.name, pool);
			let id: string;
			let isNew = false;
			if (res.status === 'matched' && res.match) {
				id = res.match.id;
				const current = due.get(id) ?? 0;
				if (row.amount <= 0) {
					out.skipped.push({ name: row.name, reason: 'exists_no_amount' });
					continue;
				}
				if (current >= row.amount) {
					out.skipped.push({ name: row.name, reason: 'already_imported' });
					continue;
				}
			} else {
				const c = await deps.createCustomer({ name: row.name });
				id = c.id;
				isNew = true;
				pool.push({ id: c.id, name: c.name });
				due.set(id, 0);
				out.created++;
			}
			if (row.amount > 0) {
				const r = await deps.commit({
					kind: 'sale',
					customerId: id,
					paymentMode: 'tab',
					items: [{ productId: null, name: OPENING_ITEM_NAME, qty: 1, unit: null, unitPrice: row.amount }],
					amount: row.amount,
					transcript: 'notebook import'
				});
				due.set(id, r.customerDue ?? (due.get(id) ?? 0) + row.amount);
				out.totalDue = Math.round((out.totalDue + row.amount) * 100) / 100;
				if (!isNew) out.updated++;
			}
		} catch (e) {
			out.failed.push({ name: row.name, code: (e as { code?: string })?.code ?? 'error' });
		}
	}
	return out;
}
