import type { CustomerBalance } from '#lib/ledger-types.js';

export type PaymentMode ='cash' | 'tab' | 'unknown';

export type Match = { id: string; name: string; score: number };

export type EntityResolution = {
	/** Name as heard/understood (Latin script). */
	spoken: string;
	status: 'matched' | 'ambiguous' | 'new';
	match: Match | null;
	candidates: Match[];
};

export type DraftItem = {
	spoken: string;
	qty: number;
	unit: string | null;
	unitPrice: number | null;
	product: EntityResolution;
};

export type DraftIssue =
	| 'payment_mode'
	| 'customer_required'
	| 'customer_new'
	| 'customer_ambiguous'
	| 'amount_missing'
	| 'product_new';

export type Draft = {
	transcript: string;
	intent: 'sale' | 'payment' | 'query' | 'clarify' | 'unknown';
	customer: EntityResolution | null;
	items: DraftItem[];
	/** Computed in code (never taken from the model unless the user stated a total). */
	amount: number | null;
	/** Total the shopkeeper said (or typed). Used as `amount` while some sale items have no price. */
	statedTotal?: number | null;
	paymentMode: PaymentMode;
	issues: DraftIssue[];
	/** Clarification text from the model, if it could not understand. */
	question: string | null;
};

/** Spoken/displayed result of a dues query. */
export type VoiceAnswer = {
	text: string;
	total: number;
	customers: CustomerBalance[];
};

/** Result of a successful commit, as shown/spoken by the page. */
export type Committed = { txnId: string; message: string; spoken: string };
