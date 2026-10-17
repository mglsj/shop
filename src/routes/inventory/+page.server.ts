import { fail } from '@sveltejs/kit';
import { createProduct, deleteProduct, listProducts, updateProduct } from '#lib/server/products.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { shop } = await parent();
	return { products: await listProducts(), language: shop?.language ?? 'hi-IN' };
};

type Parsed = {
	name: string;
	unit: string | null;
	defaultPrice: number | null;
	stockQty: number | null;
};

/** Empty string means "not set". Returns undefined when the value is not a valid non-negative number. */
function parseOptionalNumber(raw: FormDataEntryValue | null): number | null | undefined {
	const s = String(raw ?? '').trim();
	if (!s) return null;
	const n = Number(s);
	if (!Number.isFinite(n) || n < 0) return undefined;
	return n;
}

function parseFields(data: FormData): Parsed | { error: string } {
	const name = String(data.get('name') ?? '').trim();
	if (!name || name.length > 100) return { error: 'name' };
	const unit = String(data.get('unit') ?? '').trim().slice(0, 20) || null;
	const defaultPrice = parseOptionalNumber(data.get('defaultPrice'));
	if (defaultPrice === undefined) return { error: 'defaultPrice' };
	const stockQty = parseOptionalNumber(data.get('stockQty'));
	if (stockQty === undefined) return { error: 'stockQty' };
	return { name, unit, defaultPrice, stockQty };
}

function parseId(data: FormData): string | null {
	const id = String(data.get('id') ?? '').trim();
	return id || null;
}

export const actions: Actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const fields = parseFields(data);
		if ('error' in fields) return fail(400, { action: 'create', ...fields });
		await createProduct(fields);
		return { action: 'create', ok: true };
	},

	update: async ({ request }) => {
		const data = await request.formData();
		const id = parseId(data);
		if (!id) return fail(400, { action: 'update', error: 'id' });
		const fields = parseFields(data);
		if ('error' in fields) return fail(400, { action: 'update', id, ...fields });
		const updated = await updateProduct(id, fields);
		if (!updated) return fail(404, { action: 'update', id, error: 'id' });
		return { action: 'update', ok: true };
	},

	delete: async ({ request }) => {
		const data = await request.formData();
		const id = parseId(data);
		if (!id) return fail(400, { action: 'delete', error: 'id' });
		try {
			await deleteProduct(id);
		} catch (e) {
			if (e instanceof Error && e.message === 'in_use')
				return fail(409, { action: 'delete', id, error: 'in_use' });
			throw e;
		}
		return { action: 'delete', ok: true };
	}
};
