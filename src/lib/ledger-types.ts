/** Client-safe contracts shared by the ledger backend (src/lib/server/ledger.ts), the HTTP API and the UI. */

export type CustomerBalance = {
	id: string;
	name: string;
	phone: string | null;
	/** Rupees currently owed: sum(non-reversed tab sales) - sum(non-reversed payments). Can be negative (advance). */
	due: number;
	/** Unix seconds of the latest non-reversed entry, or null. */
	lastActivity: number | null;
};

export type LedgerEntryItem = {
	name: string;
	qty: number;
	unit: string | null;
	unitPrice: number;
	lineTotal: number;
};

export type LedgerEntry = {
	id: string;
	kind: 'sale' | 'payment';
	paymentMode: 'cash' | 'tab';
	amount: number;
	items: LedgerEntryItem[];
	note: string | null;
	/** Unix seconds. */
	createdAt: number;
	/** True when a later reversing entry cancelled this one (undo). */
	reversed: boolean;
};

export type CommitItem = {
	/** Existing product id, or null to create a product named `name`. */
	productId: string | null;
	name: string;
	qty: number;
	unit: string | null;
	unitPrice: number;
};

export type CommitInput =
	| {
			kind: 'sale';
			/** null allowed only for cash sales. */
			customerId: string | null;
			paymentMode: 'cash' | 'tab';
			items: CommitItem[];
			/** Rupees. Normally sum of lines; server recomputes and rejects mismatches > 0.5. */
			amount: number;
			transcript?: string;
	  }
	| { kind: 'payment'; customerId: string; amount: number; transcript?: string };

export type CommitResult = { txnId: string; customerDue: number | null };
