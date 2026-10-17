import { expect, test } from 'bun:test';
import type { CommitInput } from '#lib/ledger-types.js';
import { commitRows } from './commit-rows.js';

function setup() {
	const commits: CommitInput[] = [];
	const created: string[] = [];
	const deps = {
		pool: [{ id: 'c1', name: 'Ramesh Kumar' }, { id: 'c2', name: 'Sunita' }],
		balances: [
			{ id: 'c1', name: 'Ramesh Kumar', phone: null, due: 100, lastActivity: null },
			{ id: 'c2', name: 'Sunita', phone: null, due: 0, lastActivity: null }
		],
		createCustomer: async ({ name }: { name: string }) => {
			if (name === 'Boom') throw Object.assign(new Error('x'), { code: 'duplicate_customer' });
			created.push(name);
			return { id: 'n' + created.length, name };
		},
		commit: async (input: CommitInput) => {
			commits.push(input);
			return { txnId: 't', customerDue: null };
		}
	};
	return { deps, commits, created };
}

test('creates, updates, skips and reports failures', async () => {
	const { deps, commits, created } = setup();
	const r = await commitRows(
		[
			{ name: 'Ramesh Kumar', amount: 100 }, // already has due >= amount
			{ name: 'Sunita', amount: 50 },
			{ name: 'Mohan Lal', amount: 200 },
			{ name: 'Geeta', amount: 0 },
			{ name: 'Boom', amount: 10 }
		],
		deps
	);
	expect(r.created).toBe(2);
	expect(r.updated).toBe(1);
	expect(r.totalDue).toBe(250);
	expect(r.skipped).toEqual([{ name: 'Ramesh Kumar', reason: 'already_imported' }]);
	expect(r.failed).toEqual([{ name: 'Boom', code: 'duplicate_customer' }]);
	expect(created).toEqual(['Mohan Lal', 'Geeta']);
	expect(commits).toHaveLength(2);
	const c = commits[0] as Extract<CommitInput, { kind: 'sale' }>;
	expect(c.paymentMode).toBe('tab');
	expect(c.items[0].name).toBe('Old balance (notebook)');
	expect(c.transcript).toBe('notebook import');
});
