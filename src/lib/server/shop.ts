import { db } from '#lib/server/db/index.js';
import type { Language } from '#lib/languages.js';
import { eq } from 'drizzle-orm';
import { shop } from '#lib/server/db/schema.js';

export async function getShop() {
	return (await db.select().from(shop).limit(1))[0] ?? null;
}

export async function createShop(values: { name: string; language: Language }) {
	return (await db.insert(shop).values(values).returning())[0];
}

/** Single-shop app: creates the shop, or updates it in place (ledger data is untouched). */
export async function saveShop(values: { name: string; language: Language }) {
	const existing = await getShop();
	if (!existing) return createShop(values);
	return (await db.update(shop).set(values).where(eq(shop.id, existing.id)).returning())[0];
}
