import { count, eq, asc } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { product, productAlias, txnItem } from '#lib/server/db/schema.js';
import { normalizeName } from '#lib/server/voice/match.js';

export type ProductFields = {
	name?: string;
	unit?: string | null;
	defaultPrice?: number | null;
	stockQty?: number | null;
};

export type NewProduct = {
	name: string;
	unit?: string | null;
	defaultPrice?: number | null;
	stockQty?: number | null;
};

export async function listProducts() {
	return db.select().from(product).orderBy(asc(product.name));
}

export async function createProduct(input: NewProduct) {
	const [created] = await db
		.insert(product)
		.values({
			name: input.name,
			unit: input.unit ?? null,
			defaultPrice: input.defaultPrice ?? null,
			stockQty: input.stockQty ?? null
		})
		.returning();
	await db.insert(productAlias).values({
		productId: created.id,
		alias: created.name,
		aliasNorm: normalizeName(created.name)
	});
	return created;
}

export async function updateProduct(id: string, patch: ProductFields) {
	const values: Partial<typeof product.$inferInsert> = {};
	if (patch.name !== undefined) values.name = patch.name;
	if (patch.unit !== undefined) values.unit = patch.unit;
	if (patch.defaultPrice !== undefined) values.defaultPrice = patch.defaultPrice;
	if (patch.stockQty !== undefined) values.stockQty = patch.stockQty;

	const [updated] = Object.keys(values).length
		? await db.update(product).set(values).where(eq(product.id, id)).returning()
		: await db.select().from(product).where(eq(product.id, id));

	if (patch.name !== undefined && updated) {
		// Drop stale spellings of the old name and store the new one.
		await db.delete(productAlias).where(eq(productAlias.productId, id));
		await db.insert(productAlias).values({
			productId: id,
			alias: patch.name,
			aliasNorm: normalizeName(patch.name)
		});
	}
	return updated ?? null;
}

export async function deleteProduct(id: string) {
	const [{ used }] = await db
		.select({ used: count() })
		.from(txnItem)
		.where(eq(txnItem.productId, id));
	if (used > 0) throw new Error('in_use');
	await db.delete(productAlias).where(eq(productAlias.productId, id));
	await db.delete(product).where(eq(product.id, id));
}
