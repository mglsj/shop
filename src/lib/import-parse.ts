/** Pure, client-safe parsing of Sarvam Doc AI extraction output into reviewable notebook rows. */

export type ImportRow = {
	name: string;
	amount: number;
	/** Index of the first earlier row with the same normalized name, or null. */
	duplicateOf: number | null;
};

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

export function normalizeRowName(name: string): string {
	return name
		.normalize('NFC')
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** "₹1,200/-", "Rs. 50.5", "१२००", 30 -> number; blank/garbage -> 0; negative -> NaN (caller drops). */
export function parseAmount(v: unknown): number {
	if (typeof v === 'number') return Number.isFinite(v) ? round2(v) : 0;
	if (typeof v !== 'string') return 0;
	const s = v
		.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
		.replace(/\/-/g, '')
		.replace(/rs\.?|inr/gi, '')
		.replace(/[^\d.\-]/g, '');
	if (!s) return 0;
	const n = Number(s);
	return Number.isFinite(n) ? round2(n) : 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Recompute duplicate flags (also used by the UI after edits). */
export function flagDuplicates<T extends { name: string }>(rows: T[]): (number | null)[] {
	const first = new Map<string, number>();
	return rows.map((r, i) => {
		const key = normalizeRowName(r.name);
		if (!key) return null;
		const seen = first.get(key);
		if (seen === undefined) {
			first.set(key, i);
			return null;
		}
		return seen;
	});
}

export function parseExtraction(raw: unknown): { rows: ImportRow[] } {
	const obj = (x: unknown): Record<string, unknown> | null =>
		x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
	const top = obj(raw);
	const root = obj(top?.result) ?? top;
	let list: unknown = root?.customers;
	if (!Array.isArray(list) && Array.isArray(raw)) list = raw;
	if (!Array.isArray(list)) return { rows: [] };

	const base: { name: string; amount: number }[] = [];
	for (const item of list) {
		const o = obj(item);
		if (!o) continue;
		const name = typeof o.name === 'string' ? o.name.replace(/\s+/g, ' ').trim() : '';
		if (!name) continue;
		const amount = parseAmount(o.amount_due ?? o.amount);
		if (amount < 0) continue;
		base.push({ name, amount });
	}
	const dup = flagDuplicates(base);
	return { rows: base.map((r, i) => ({ ...r, duplicateOf: dup[i] })) };
}

/** Map a Doc AI job status string to a UI state. */
export function jobState(status: string): 'pending' | 'done' | 'failed' {
	if (status === 'completed' || status === 'partially_completed') return 'done';
	if (status === 'failed' || status === 'rejected') return 'failed';
	return 'pending';
}
