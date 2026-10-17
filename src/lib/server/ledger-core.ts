/** Ledger logic with an injected drizzle db (no `$app` imports, so it is unit-testable). */
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type {
	CommitInput,
	CommitResult,
	CustomerBalance,
	LedgerEntry
} from '#lib/ledger-types.js';
import {
	customer,
	customerAlias,
	product,
	productAlias,
	txn,
	txnItem
} from '#lib/server/db/schema.js';
import type * as schema from '#lib/server/db/schema.js';
import { devanagariToLatin, normalizeName } from '#lib/server/voice/match.js';

export type Db = LibSQLDatabase<typeof schema>;
export type TransliterateFn = (input: string, source: string, target: string) => Promise<string>;
export type CustomerDeps = { transliterate?: TransliterateFn | null };

export class LedgerError extends Error {
	constructor(
		readonly code: string,
		message?: string
	) {
		super(message ?? code);
		this.name = 'LedgerError';
	}
}

const secs = (d: Date | number | null | undefined) =>
	d == null ? null : d instanceof Date ? Math.floor(d.getTime() / 1000) : d;

/** Non-reversed, non-reversal txn rows. */
const active = (db: Db) =>
	and(
		isNull(txn.reversesId),
		sql`${txn.id} not in (select ${txn.reversesId} from ${txn} where ${txn.reversesId} is not null)`
	);

function dueOf(rows: { kind: string; paymentMode: string; amount: number }[]) {
	let due = 0;
	for (const r of rows) {
		if (r.kind === 'sale' && r.paymentMode === 'tab') due += r.amount;
		else if (r.kind === 'payment') due -= r.amount;
	}
	return Math.round(due * 100) / 100;
}

async function customerDue(db: Db, customerId: string) {
	const rows = await db
		.select({ kind: txn.kind, paymentMode: txn.paymentMode, amount: txn.amount })
		.from(txn)
		.where(and(eq(txn.customerId, customerId), active(db)));
	return dueOf(rows);
}

export async function listBalances(db: Db): Promise<CustomerBalance[]> {
	const [customers, rows] = await Promise.all([
		db.select().from(customer),
		db
			.select({
				customerId: txn.customerId,
				kind: txn.kind,
				paymentMode: txn.paymentMode,
				amount: txn.amount,
				createdAt: txn.createdAt
			})
			.from(txn)
			.where(and(isNotNull(txn.customerId), active(db)))
	]);
	const by = new Map<string, typeof rows>();
	for (const r of rows) by.set(r.customerId!, [...(by.get(r.customerId!) ?? []), r]);
	return customers
		.map((c) => {
			const rs = by.get(c.id) ?? [];
			const last = rs.reduce<number | null>((m, r) => {
				const t = secs(r.createdAt);
				return t != null && (m == null || t > m) ? t : m;
			}, null);
			return { id: c.id, name: c.name, phone: c.phone, due: dueOf(rs), lastActivity: last };
		})
		.sort((a, b) => b.due - a.due || a.name.localeCompare(b.name));
}

export async function getCustomerLedger(db: Db, customerId: string) {
	const c = (await db.select().from(customer).where(eq(customer.id, customerId)))[0];
	if (!c) return null;
	const rows = await db
		.select()
		.from(txn)
		.where(and(eq(txn.customerId, customerId), isNull(txn.reversesId)))
		.orderBy(desc(txn.createdAt), sql`${txn}.rowid desc`);
	const reversedIds = new Set(
		(
			await db
				.select({ r: txn.reversesId })
				.from(txn)
				.where(and(eq(txn.customerId, customerId), isNotNull(txn.reversesId)))
		).map((x) => x.r)
	);
	const items = rows.length
		? await db
				.select({
					txnId: txnItem.txnId,
					name: product.name,
					unit: product.unit,
					qty: txnItem.qty,
					unitPrice: txnItem.unitPrice,
					lineTotal: txnItem.lineTotal
				})
				.from(txnItem)
				.innerJoin(product, eq(product.id, txnItem.productId))
				.where(
					inArray(
						txnItem.txnId,
						rows.map((r) => r.id)
					)
				)
		: [];
	const entries: LedgerEntry[] = rows.map((r) => ({
		id: r.id,
		kind: r.kind,
		paymentMode: r.paymentMode,
		amount: r.amount,
		items: items
			.filter((i) => i.txnId === r.id)
			.map((i) => ({
				name: i.name,
				qty: i.qty,
				unit: i.unit,
				unitPrice: i.unitPrice,
				lineTotal: i.lineTotal
			})),
		note: r.note,
		createdAt: secs(r.createdAt) ?? 0,
		reversed: reversedIds.has(r.id)
	}));
	return {
		customer: { id: c.id, name: c.name, phone: c.phone },
		due: await customerDue(db, customerId),
		entries
	};
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function commit(db: Db, input: CommitInput): Promise<CommitResult> {
	if (!input || (input.kind !== 'sale' && input.kind !== 'payment'))
		throw new LedgerError('invalid_kind', 'kind must be sale or payment');
	if (!Number.isFinite(input.amount) || input.amount <= 0)
		throw new LedgerError('invalid_amount', 'amount must be > 0');

	if (input.kind === 'payment') {
		if (!input.customerId) throw new LedgerError('customer_required', 'payment needs a customer');
		const exists = (await db.select({ id: customer.id }).from(customer).where(eq(customer.id, input.customerId)))[0];
		if (!exists) throw new LedgerError('customer_not_found', 'customer not found');
		const id = crypto.randomUUID();
		await db.insert(txn).values({
			id,
			kind: 'payment',
			customerId: input.customerId,
			paymentMode: 'cash',
			amount: input.amount,
			rawTranscript: input.transcript ?? null
		});
		return { txnId: id, customerDue: await customerDue(db, input.customerId) };
	}

	// sale
	if (input.paymentMode !== 'cash' && input.paymentMode !== 'tab')
		throw new LedgerError('invalid_payment_mode', 'paymentMode must be cash or tab');
	if (!Array.isArray(input.items) || input.items.length === 0)
		throw new LedgerError('no_items', 'sale needs at least one item');
	if (input.paymentMode === 'tab' && !input.customerId)
		throw new LedgerError('customer_required', 'tab sale needs a customer');
	for (const it of input.items) {
		if (!it.name?.trim()) throw new LedgerError('invalid_item', 'item name required');
		if (!Number.isFinite(it.qty) || it.qty <= 0) throw new LedgerError('invalid_qty', 'qty must be > 0');
		if (!Number.isFinite(it.unitPrice) || it.unitPrice < 0)
			throw new LedgerError('invalid_price', 'unitPrice must be >= 0');
	}
	const total = input.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
	if (Math.abs(total - input.amount) > 0.5)
		throw new LedgerError('amount_mismatch', `amount ${input.amount} does not match lines ${round2(total)}`);

	if (input.customerId) {
		const exists = (await db.select({ id: customer.id }).from(customer).where(eq(customer.id, input.customerId)))[0];
		if (!exists) throw new LedgerError('customer_not_found', 'customer not found');
	}

	const txnId = crypto.randomUUID();
	await db.transaction(async (tx) => {
		const lines: { productId: string; qty: number; unitPrice: number; lineTotal: number }[] = [];
		let existing: { id: string; aliasNorm: string }[] | null = null;
		for (const it of input.items) {
			let productId = it.productId;
			if (productId) {
				const p = (await tx.select({ id: product.id }).from(product).where(eq(product.id, productId)))[0];
				if (!p) throw new LedgerError('product_not_found', `product ${productId} not found`);
			} else {
				const norm = normalizeName(it.name);
				existing ??= await tx
					.select({ id: productAlias.productId, aliasNorm: productAlias.aliasNorm })
					.from(productAlias);
				const hit = existing.find((e) => e.aliasNorm === norm);
				if (hit) productId = hit.id;
				else {
					productId = crypto.randomUUID();
					await tx.insert(product).values({
						id: productId,
						name: it.name.trim(),
						unit: it.unit,
						defaultPrice: it.unitPrice
					});
					await tx.insert(productAlias).values({
						productId,
						alias: it.name.trim(),
						aliasNorm: norm
					});
					existing.push({ id: productId, aliasNorm: norm });
				}
			}
			lines.push({
				productId,
				qty: it.qty,
				unitPrice: it.unitPrice,
				lineTotal: round2(it.qty * it.unitPrice)
			});
		}
		await tx.insert(txn).values({
			id: txnId,
			kind: 'sale',
			customerId: input.customerId,
			paymentMode: input.paymentMode,
			amount: input.amount,
			rawTranscript: input.transcript ?? null
		});
		await tx.insert(txnItem).values(lines.map((l) => ({ ...l, txnId })));
	});
	return {
		txnId,
		customerDue: input.customerId ? await customerDue(db, input.customerId) : null
	};
}

export async function undo(db: Db, txnId: string): Promise<{ customerDue: number | null }> {
	const orig = (await db.select().from(txn).where(eq(txn.id, txnId)))[0];
	if (!orig) throw new LedgerError('txn_not_found', 'transaction not found');
	if (orig.reversesId) throw new LedgerError('cannot_undo_reversal', 'cannot undo an undo');
	const done = (await db.select({ id: txn.id }).from(txn).where(eq(txn.reversesId, txnId)))[0];
	if (done) throw new LedgerError('already_undone', 'transaction already undone');
	await db.insert(txn).values({
		kind: orig.kind,
		customerId: orig.customerId,
		paymentMode: orig.paymentMode,
		amount: orig.amount,
		note: 'undo',
		reversesId: txnId
	});
	return { customerDue: orig.customerId ? await customerDue(db, orig.customerId) : null };
}

export async function findDues(db: Db, customerId?: string) {
	const all = await listBalances(db);
	const customers = (customerId ? all.filter((c) => c.id === customerId) : all.filter((c) => c.due > 0)).sort(
		(a, b) => b.due - a.due
	);
	const total = round2(customers.filter((c) => c.due > 0).reduce((s, c) => s + c.due, 0));
	return { total, customers };
}

const hasDevanagari = (s: string) => /[ऀ-ॿ]/.test(s);

export async function addCustomerAlias(db: Db, customerId: string, alias: string) {
	const a = alias.trim();
	const c = (await db.select().from(customer).where(eq(customer.id, customerId)))[0];
	if (!c) throw new LedgerError('customer_not_found', 'customer not found');
	if (!a) throw new LedgerError('invalid_name', 'alias required');
	const aliasNorm = normalizeName(a);
	if (aliasNorm) {
		const dup = await db
			.select({ id: customerAlias.id })
			.from(customerAlias)
			.where(and(eq(customerAlias.customerId, customerId), eq(customerAlias.aliasNorm, aliasNorm)));
		if (dup.length === 0) await db.insert(customerAlias).values({ customerId, alias: a, aliasNorm });
	}
	return { id: c.id, name: c.name, phone: c.phone };
}

export async function createCustomer(
	db: Db,
	input: { name: string; phone?: string | null },
	deps: CustomerDeps = {}
) {
	const name = input.name?.trim();
	if (!name) throw new LedgerError('invalid_name', 'name required');
	const norm = normalizeName(name);
	const dup = await db
		.select({ id: customerAlias.id })
		.from(customerAlias)
		.where(eq(customerAlias.aliasNorm, norm));
	const dupName = (await db.select({ name: customer.name }).from(customer)).some(
		(c) => normalizeName(c.name) === norm
	);
	if (dupName || dup.length > 0) throw new LedgerError('duplicate_customer', 'customer already exists');

	const id = crypto.randomUUID();
	const phone = input.phone?.trim() || null;
	const aliases = [name];
	try {
		if (hasDevanagari(name)) {
			const latin = deps.transliterate
				? await deps.transliterate(name, 'hi-IN', 'en-IN')
				: devanagariToLatin(name);
			aliases.push(latin);
		} else if (deps.transliterate) {
			aliases.push(await deps.transliterate(name, 'en-IN', 'hi-IN'));
		}
	} catch {
		if (hasDevanagari(name)) aliases.push(devanagariToLatin(name));
	}
	const rows: { customerId: string; alias: string; aliasNorm: string }[] = [];
	for (const alias of aliases) {
		const a = alias.trim();
		const aliasNorm = normalizeName(a);
		if (a && !rows.some((r) => r.alias === a)) rows.push({ customerId: id, alias: a, aliasNorm });
	}
	await db.transaction(async (tx) => {
		await tx.insert(customer).values({ id, name, phone });
		await tx.insert(customerAlias).values(rows);
	});
	return { id, name, phone };
}
