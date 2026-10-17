import { fail } from '@sveltejs/kit';
import { commit, createCustomer, listBalances, LedgerError } from '#lib/server/ledger.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { shop } = await parent();
	const customers = await listBalances();
	const totalDue = Math.round(customers.reduce((s, c) => s + Math.max(c.due, 0), 0) * 100) / 100;
	return { customers, totalDue, language: shop?.language ?? 'hi-IN' };
};

/** Parses a positive rupee amount. Returns null when invalid. */
function parseAmount(raw: FormDataEntryValue | null): number | null {
	const n = Number(String(raw ?? '').trim());
	if (!Number.isFinite(n) || n <= 0) return null;
	return Math.round(n * 100) / 100;
}

export const actions: Actions = {
	pay: async ({ request }) => {
		const data = await request.formData();
		const customerId = String(data.get('customerId') ?? '').trim();
		const amount = parseAmount(data.get('amount'));
		if (!customerId) return fail(400, { action: 'pay', error: 'notFound' });
		if (amount === null) return fail(400, { action: 'pay', customerId, error: 'amount' });
		try {
			await commit({ kind: 'payment', customerId, amount });
		} catch (e) {
			if (e instanceof LedgerError && e.code === 'customer_not_found')
				return fail(404, { action: 'pay', customerId, error: 'notFound' });
			if (e instanceof LedgerError && e.code === 'invalid_amount')
				return fail(400, { action: 'pay', customerId, error: 'amount' });
			throw e;
		}
		return { action: 'pay', customerId, ok: true };
	},

	addCustomer: async ({ request }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const phone = String(data.get('phone') ?? '').trim() || null;
		if (!name || name.length > 100) return fail(400, { action: 'addCustomer', error: 'name' });
		if (phone && (phone.length > 20 || !/^[0-9+\-\s]+$/.test(phone)))
			return fail(400, { action: 'addCustomer', error: 'phone' });
		try {
			await createCustomer({ name, phone });
		} catch (e) {
			if (e instanceof LedgerError && e.code === 'duplicate_customer')
				return fail(409, { action: 'addCustomer', error: 'duplicate' });
			if (e instanceof LedgerError && e.code === 'invalid_name')
				return fail(400, { action: 'addCustomer', error: 'name' });
			throw e;
		}
		return { action: 'addCustomer', ok: true };
	}
};
