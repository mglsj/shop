import { error, fail } from '@sveltejs/kit';
import { commit, getCustomerLedger, LedgerError, undo as undoTxn } from '#lib/server/ledger.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	const ledger = await getCustomerLedger(params.id);
	if (!ledger) error(404, 'Customer not found');
	const { shop } = await parent();
	return { ledger, language: shop?.language ?? 'hi-IN', shopName: shop?.name ?? '' };
};

/** Parses a positive rupee amount. Returns null when invalid. */
function parseAmount(raw: FormDataEntryValue | null): number | null {
	const n = Number(String(raw ?? '').trim());
	if (!Number.isFinite(n) || n <= 0) return null;
	return Math.round(n * 100) / 100;
}

export const actions: Actions = {
	pay: async ({ params, request }) => {
		const data = await request.formData();
		const amount = parseAmount(data.get('amount'));
		if (amount === null) return fail(400, { action: 'pay', error: 'amount' });
		try {
			await commit({ kind: 'payment', customerId: params.id, amount });
		} catch (e) {
			if (e instanceof LedgerError && e.code === 'customer_not_found')
				return fail(404, { action: 'pay', error: 'notFound' });
			if (e instanceof LedgerError && e.code === 'invalid_amount')
				return fail(400, { action: 'pay', error: 'amount' });
			throw e;
		}
		return { action: 'pay', ok: true };
	},

	undo: async ({ request }) => {
		const data = await request.formData();
		const txnId = String(data.get('txnId') ?? '').trim();
		if (!txnId) return fail(400, { action: 'undo', error: 'txnNotFound' });
		try {
			await undoTxn(txnId);
		} catch (e) {
			if (e instanceof LedgerError && e.code === 'txn_not_found')
				return fail(404, { action: 'undo', txnId, error: 'txnNotFound' });
			if (e instanceof LedgerError && e.code === 'already_undone')
				return fail(409, { action: 'undo', txnId, error: 'alreadyUndone' });
			if (e instanceof LedgerError && e.code === 'cannot_undo_reversal')
				return fail(400, { action: 'undo', txnId, error: 'undoFailed' });
			throw e;
		}
		return { action: 'undo', ok: true };
	}
};
