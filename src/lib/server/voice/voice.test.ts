import { describe, expect, test } from 'bun:test';
import { buildDraft } from './draft.js';
import { parseToolCall, verifyPaymentMode } from './intent.js';
import { devanagariToLatin, normalizeName, resolveEntity } from './match.js';

const customers = [
	{ id: 'c1', name: 'Ramesh Kumar', aliases: ['रमेश'] },
	{ id: 'c2', name: 'Rakesh' },
	{ id: 'c3', name: 'Sunita' }
];

describe('name normalization', () => {
	test('Devanagari and Latin spellings collapse to one key', () => {
		expect(devanagariToLatin('रमेश')).toBe('ramesh');
		expect(normalizeName('रमेश')).toBe(normalizeName('Ramesh'));
		expect(normalizeName('सुनीता')).toBe(normalizeName('Sunita'));
		expect(normalizeName('Shyam')).toBe(normalizeName('श्याम'));
		expect(normalizeName('Vijay')).toBe(normalizeName('Wijay'));
	});
});

describe('resolveEntity', () => {
	test('exact and Devanagari match', () => {
		expect(resolveEntity('Sunita', customers).match?.id).toBe('c3');
		expect(resolveEntity('सुनीता', customers).match?.id).toBe('c3');
		expect(resolveEntity('रमेश', customers).status).toBe('matched');
	});
	test('first name matches a full name', () => {
		expect(resolveEntity('Ramesh', customers).match?.id).toBe('c1');
	});
	test('misspelling still matches', () => {
		expect(resolveEntity('Sunitaa', customers).match?.id).toBe('c3');
	});
	test('unknown name is new', () => {
		expect(resolveEntity('Gopal', customers).status).toBe('new');
	});
	test('two people with the same first name are ambiguous', () => {
		const res = resolveEntity('Ramesh', [
			{ id: 'a', name: 'Ramesh Kumar' },
			{ id: 'b', name: 'Ramesh Gupta' }
		]);
		expect(res.status).toBe('ambiguous');
		expect(res.candidates.map((c) => c.id).sort()).toEqual(['a', 'b']);
	});
});

describe('parseToolCall', () => {
	test('valid sale', () => {
		const intent = parseToolCall(
			'record_sale',
			JSON.stringify({
				customer_name: 'Ramesh',
				items: [{ name: 'rice', qty: 2, unit: 'kg', unit_price: 60 }],
				payment_mode: 'tab'
			})
		);
		expect(intent).toMatchObject({ kind: 'sale', paymentMode: 'tab', customerName: 'Ramesh' });
	});
	test('garbage degrades to unknown', () => {
		expect(parseToolCall('record_sale', '{not json')).toEqual({ kind: 'unknown' });
		expect(parseToolCall('record_sale', '{"items":[]}')).toEqual({ kind: 'unknown' });
		expect(parseToolCall('nope', '{}')).toEqual({ kind: 'unknown' });
	});
	test('invalid payment_mode becomes unknown', () => {
		const intent = parseToolCall(
			'record_sale',
			JSON.stringify({ items: [{ name: 'oil', qty: 1 }], payment_mode: 'maybe' })
		);
		expect(intent).toMatchObject({ kind: 'sale', paymentMode: 'unknown' });
	});
});

describe('buildDraft', () => {
	const ctx = {
		customers,
		products: [{ id: 'p1', name: 'Rice', aliases: ['chawal'], defaultPrice: 60 }]
	};

	test('tab sale computes total in code and flags nothing', () => {
		const draft = buildDraft(
			'Ramesh ne 2 kilo chawal udhaar liya',
			{
				kind: 'sale',
				customerName: 'Ramesh',
				items: [{ name: 'chawal', qty: 2.5, unit: 'kg', unitPrice: null }],
				totalAmount: null,
				paymentMode: 'tab'
			},
			ctx
		);
		expect(draft.amount).toBe(150);
		expect(draft.customer?.match?.id).toBe('c1');
		expect(draft.issues).toEqual([]);
	});

	test('unknown payment mode, new customer and unpriced product are flagged', () => {
		const draft = buildDraft(
			'Gopal biscuit',
			{
				kind: 'sale',
				customerName: 'Gopal',
				items: [{ name: 'biscuit', qty: 1, unit: null, unitPrice: null }],
				totalAmount: null,
				paymentMode: 'unknown'
			},
			ctx
		);
		expect(draft.issues).toEqual(
			expect.arrayContaining(['customer_new', 'payment_mode', 'amount_missing', 'product_new'])
		);
		expect(draft.amount).toBeNull();
	});

	test('stated total is used when items have no price', () => {
		const draft = buildDraft(
			'biscuit kul 20 paid',
			{
				kind: 'sale',
				customerName: null,
				items: [{ name: 'biscuit', qty: 1, unit: null, unitPrice: null }],
				totalAmount: 20,
				paymentMode: 'cash'
			},
			ctx
		);
		expect(draft.amount).toBe(20);
		expect(draft.issues).toEqual(['product_new']);
	});

	test('tab sale without customer needs a customer', () => {
		const draft = buildDraft(
			'x',
			{
				kind: 'sale',
				customerName: null,
				items: [{ name: 'rice', qty: 1, unit: null, unitPrice: 60 }],
				totalAmount: null,
				paymentMode: 'tab'
			},
			ctx
		);
		expect(draft.issues).toContain('customer_required');
	});

	test('payment needs customer and amount', () => {
		const draft = buildDraft('x', { kind: 'payment', customerName: null, amount: null }, ctx);
		expect(draft.issues).toEqual(expect.arrayContaining(['customer_required', 'amount_missing']));
	});
});

test('trailing repeated letters do not break matching', () => {
	expect(normalizeName('Rameshh')).toBe(normalizeName('Ramesh'));
});

describe('verifyPaymentMode', () => {
	test('keeps a mode only when the transcript says so', () => {
		expect(verifyPaymentMode('cash', 'Sunita bought one packet of biscuits for 10 rupees')).toBe('unknown');
		expect(verifyPaymentMode('cash', 'Sunita bought biscuits, paid cash')).toBe('cash');
		expect(verifyPaymentMode('tab', 'रमेश ने तेल उधार लिया')).toBe('tab');
		expect(verifyPaymentMode('tab', 'Ramesh took rice')).toBe('unknown');
		expect(verifyPaymentMode('unknown', 'cash')).toBe('unknown');
	});
});
