import { relations, sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
	integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`);

import { LANGUAGES, type Language } from '#lib/languages.js';
export { LANGUAGES, type Language };

/** Single-row table for now (no auth). */
export const shop = sqliteTable('shop', {
	id: id(),
	name: text('name').notNull(),
	language: text('language', { enum: LANGUAGES }).notNull(),
	createdAt: createdAt()
});

export const customer = sqliteTable('customer', {
	id: id(),
	name: text('name').notNull(),
	phone: text('phone'),
	createdAt: createdAt()
});

/** Spelling variants (Devanagari + romanized). aliasNorm is lowercase Latin for matching. */
export const customerAlias = sqliteTable(
	'customer_alias',
	{
		id: id(),
		customerId: text('customer_id')
			.notNull()
			.references(() => customer.id, { onDelete: 'cascade' }),
		alias: text('alias').notNull(),
		aliasNorm: text('alias_norm').notNull()
	},
	(t) => [index('customer_alias_customer_idx').on(t.customerId)]
);

export const product = sqliteTable('product', {
	id: id(),
	name: text('name').notNull(),
	unit: text('unit'),
	defaultPrice: real('default_price'),
	stockQty: real('stock_qty'),
	createdAt: createdAt()
});

export const productAlias = sqliteTable(
	'product_alias',
	{
		id: id(),
		productId: text('product_id')
			.notNull()
			.references(() => product.id, { onDelete: 'cascade' }),
		alias: text('alias').notNull(),
		aliasNorm: text('alias_norm').notNull()
	},
	(t) => [index('product_alias_product_idx').on(t.productId)]
);

/** Append-only ledger. Customer balance = sum(tab sales) - sum(payments). Undo = reversing entry. */
export const txn = sqliteTable(
	'txn',
	{
		id: id(),
		kind: text('kind', { enum: ['sale', 'payment'] }).notNull(),
		customerId: text('customer_id').references(() => customer.id),
		paymentMode: text('payment_mode', { enum: ['cash', 'tab'] }).notNull(),
		amount: real('amount').notNull(),
		note: text('note'),
		rawTranscript: text('raw_transcript'),
		reversesId: text('reverses_id'),
		createdAt: createdAt()
	},
	(t) => [index('txn_customer_idx').on(t.customerId)]
);

export const txnItem = sqliteTable(
	'txn_item',
	{
		id: id(),
		txnId: text('txn_id')
			.notNull()
			.references(() => txn.id, { onDelete: 'cascade' }),
		productId: text('product_id')
			.notNull()
			.references(() => product.id),
		qty: real('qty').notNull(),
		unitPrice: real('unit_price').notNull(),
		lineTotal: real('line_total').notNull()
	},
	(t) => [index('txn_item_txn_idx').on(t.txnId)]
);

export const customerRelations = relations(customer, ({ many }) => ({
	aliases: many(customerAlias),
	txns: many(txn)
}));
export const customerAliasRelations = relations(customerAlias, ({ one }) => ({
	customer: one(customer, { fields: [customerAlias.customerId], references: [customer.id] })
}));
export const productRelations = relations(product, ({ many }) => ({ aliases: many(productAlias) }));
export const productAliasRelations = relations(productAlias, ({ one }) => ({
	product: one(product, { fields: [productAlias.productId], references: [product.id] })
}));
export const txnRelations = relations(txn, ({ one, many }) => ({
	customer: one(customer, { fields: [txn.customerId], references: [customer.id] }),
	items: many(txnItem)
}));
export const txnItemRelations = relations(txnItem, ({ one }) => ({
	txn: one(txn, { fields: [txnItem.txnId], references: [txn.id] }),
	product: one(product, { fields: [txnItem.productId], references: [product.id] })
}));
