import { beforeEach, describe, expect, test } from 'bun:test';
import { createClient } from '@libsql/client';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/libsql';
import { pushSQLiteSchema } from 'drizzle-kit/api';
import * as schema from '#lib/server/db/schema.js';
import * as L from '#lib/server/ledger-core.js';
import type { Db } from '#lib/server/ledger-core.js';

let db: Db;

beforeEach(async () => {
	// libsql :memory: loses data after db.transaction() (connection swap), so use a temp file
	const client = createClient({
		url: 'file:' + join(tmpdir(), `ledger-test-${crypto.randomUUID()}.db`)
	});
	db = drizzle(client, { schema });
	const { apply } = await pushSQLiteSchema(schema, db as never);
	await apply();
});

const cust = (name: string) => L.createCustomer(db, { name });
const tabSale = (customerId: string, amount: number, name = 'Atta') =>
	L.commit(db, {
		kind: 'sale',
		customerId,
		paymentMode: 'tab',
		items: [{ productId: null, name, qty: 1, unit: 'kg', unitPrice: amount }],
		amount
	});
const pay = (customerId: string, amount: number) => L.commit(db, { kind: 'payment', customerId, amount });

async function code(p: Promise<unknown>) {
	try {
		await p;
	} catch (e) {
		expect(e).toBeInstanceOf(L.LedgerError);
		return (e as L.LedgerError).code;
	}
	return null;
}

describe('balances', () => {
	test('tab sale, cash sale ignored, partial payment', async () => {
		const c = await cust('Ramesh');
		await tabSale(c.id, 100);
		await L.commit(db, {
			kind: 'sale',
			customerId: c.id,
			paymentMode: 'cash',
			items: [{ productId: null, name: 'Chai', qty: 2, unit: null, unitPrice: 10 }],
			amount: 20
		});
		expect((await pay(c.id, 30)).customerDue).toBe(70);
		const [b] = await L.listBalances(db);
		expect(b.due).toBe(70);
		expect(b.lastActivity).toBeGreaterThan(0);
	});

	test('cash sale without customer', async () => {
		const r = await L.commit(db, {
			kind: 'sale',
			customerId: null,
			paymentMode: 'cash',
			items: [{ productId: null, name: 'Soap', qty: 1, unit: null, unitPrice: 25 }],
			amount: 25
		});
		expect(r.customerDue).toBeNull();
	});

	test('overpayment gives negative due; sorted by due desc', async () => {
		const a = await cust('Amit');
		const b = await cust('Bharat');
		await pay(a.id, 50);
		await tabSale(b.id, 10);
		const list = await L.listBalances(db);
		expect(list.map((x) => [x.name, x.due])).toEqual([['Bharat', 10], ['Amit', -50]]);
	});
});

describe('undo', () => {
	test('undo sale and payment', async () => {
		const c = await cust('Suresh');
		const s = await tabSale(c.id, 100);
		const p = await pay(c.id, 40);
		expect((await L.undo(db, p.txnId)).customerDue).toBe(100);
		expect((await L.undo(db, s.txnId)).customerDue).toBe(0);
		const ledger = await L.getCustomerLedger(db, c.id);
		expect(ledger!.entries).toHaveLength(2);
		expect(ledger!.entries.every((e) => e.reversed)).toBe(true);
		expect(ledger!.due).toBe(0);
		expect(ledger!.entries.find((e) => e.id === s.txnId)!.items[0].name).toBe('Atta');
	});

	test('double undo and undo of reversal throw', async () => {
		const c = await cust('Mohan');
		const s = await tabSale(c.id, 10);
		await L.undo(db, s.txnId);
		expect(await code(L.undo(db, s.txnId))).toBe('already_undone');
		const rev = (await db.select().from(schema.txn)).find((t) => t.reversesId)!;
		expect(await code(L.undo(db, rev.id))).toBe('cannot_undo_reversal');
		expect(await code(L.undo(db, 'nope'))).toBe('txn_not_found');
	});
});

describe('validation', () => {
	test('tab sale without customer rejected', async () => {
		expect(
			await code(
				L.commit(db, {
					kind: 'sale',
					customerId: null,
					paymentMode: 'tab',
					items: [{ productId: null, name: 'x', qty: 1, unit: null, unitPrice: 5 }],
					amount: 5
				})
			)
		).toBe('customer_required');
	});
	test('amount mismatch, zero amount, bad qty, unknown payment customer', async () => {
		const c = await cust('Dev');
		const item = { productId: null, name: 'x', qty: 2, unit: null, unitPrice: 5 };
		const base = { kind: 'sale' as const, customerId: c.id, paymentMode: 'tab' as const, items: [item] };
		expect(await code(L.commit(db, { ...base, amount: 11 }))).toBe('amount_mismatch');
		await L.commit(db, { ...base, amount: 10.4 });
		expect(await code(L.commit(db, { ...base, amount: 0 }))).toBe('invalid_amount');
		expect(await code(L.commit(db, { ...base, items: [{ ...item, qty: 0 }], amount: 5 }))).toBe('invalid_qty');
		expect(await code(pay('missing', 5))).toBe('customer_not_found');
	});
});

describe('products', () => {
	test('auto-create then reuse by normalized name', async () => {
		const c = await cust('Kiran');
		await tabSale(c.id, 50, 'Sugar');
		await tabSale(c.id, 50, 'sugar');
		await tabSale(c.id, 50, 'Shugar');
		const products = await db.select().from(schema.product);
		expect(products).toHaveLength(1);
		expect(await db.select().from(schema.productAlias)).toHaveLength(1);
		expect(await db.select().from(schema.txnItem)).toHaveLength(3);
	});
	test('stores transcript', async () => {
		const c = await cust('Lala');
		await L.commit(db, { kind: 'payment', customerId: c.id, amount: 5, transcript: 'lala ne paanch diye' });
		expect((await db.select().from(schema.txn))[0].rawTranscript).toBe('lala ne paanch diye');
	});
});

describe('customers', () => {
	test('duplicate rejected case-insensitively and by spelling', async () => {
		await cust('Ramesh');
		expect(await code(cust('ramesh'))).toBe('duplicate_customer');
		expect(await code(cust('रमेश'))).toBe('duplicate_customer');
	});
	test('aliases created via fallback and via transliterate', async () => {
		const a = await L.createCustomer(db, { name: 'सुरेश' });
		const b = await L.createCustomer(db, { name: 'Gopal' }, { transliterate: async () => 'गोपाल' });
		const rows = await db.select().from(schema.customerAlias);
		expect(rows.filter((r) => r.customerId === a.id).length).toBe(2);
		expect(rows.filter((r) => r.customerId === b.id).map((r) => r.alias)).toEqual(['Gopal', 'गोपाल']);
	});
	test('transliterate failure is swallowed', async () => {
		const c = await L.createCustomer(db, { name: 'Hari', phone: ' 99 ' }, {
			transliterate: async () => {
				throw new Error('boom');
			}
		});
		expect(c.phone).toBe('99');
		expect(await db.select().from(schema.customerAlias)).toHaveLength(1);
	});
	test('alias learning skips duplicates', async () => {
		const c = await cust('Ramesh');
		await L.addCustomerAlias(db, c.id, 'RAMESH');
		await L.addCustomerAlias(db, c.id, 'Ramesh Bhai');
		const n = (await db.select().from(schema.customerAlias)).length;
		expect(n).toBe(2);
		expect(await code(L.addCustomerAlias(db, 'missing', 'x'))).toBe('customer_not_found');
	});
});

test('findDues', async () => {
	const a = await cust('Amit');
	const b = await cust('Bharat');
	const c = await cust('Chetan');
	await tabSale(a.id, 30);
	await tabSale(b.id, 70);
	await pay(c.id, 5);
	const all = await L.findDues(db);
	expect(all.total).toBe(100);
	expect(all.customers.map((x) => x.name)).toEqual(['Bharat', 'Amit']);
	const one = await L.findDues(db, a.id);
	expect(one).toMatchObject({ total: 30 });
	expect(one.customers).toHaveLength(1);
});
