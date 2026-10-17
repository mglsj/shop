import { describe, expect, test } from 'bun:test';
import { format, rupees } from './format.js';
import type { CustomerBalance } from './ledger-types.js';
import { buildDraft } from './server/voice/draft.js';
import { buildCommitInput, nextIssue, recompute, setAmount, setItemPrice, setMatchedCustomer, setPaymentMode, setCustomer } from './voice-draft.js';
import { composeDuesAnswer } from './voice-answer.js';
import { buildNumberTable, parseCandidate, parseNumber, parsePaymentMode, parseYesNo } from './voice-reply.js';
import type { Draft } from './voice-types.js';

const ctx = {
	customers: [
		{ id: 'c1', name: 'Ramesh' },
		{ id: 'c2', name: 'Rakesh' }
	],
	products: [{ id: 'p1', name: 'Rice', aliases: ['chawal'], defaultPrice: 60 }]
};

const sale = (over: Partial<Parameters<typeof buildDraft>[1]> = {}) =>
	buildDraft(
		'x',
		{
			kind: 'sale',
			customerName: 'Ramesh',
			items: [{ name: 'chawal', qty: 2, unit: 'kg', unitPrice: null }],
			totalAmount: null,
			paymentMode: 'unknown',
			...over
		} as never,
		ctx
	);

describe('voice-draft recompute', () => {
	test('payment mode answer clears the issue', () => {
		const d = sale();
		expect(d.issues).toEqual(['payment_mode']);
		const next = setPaymentMode(d, 'tab');
		expect(next.issues).toEqual([]);
		expect(next.amount).toBe(120);
	});

	test('choosing cash with no customer is fine, tab needs one', () => {
		const d = setCustomer(sale({ customerName: 'Gopal' }), null);
		expect(setPaymentMode(d, 'cash').issues).toEqual([]);
		expect(setPaymentMode(d, 'tab').issues).toEqual(['customer_required']);
	});

	test('customer resolution and item prices update the amount', () => {
		let d = sale({ customerName: 'Gopal', items: [{ name: 'biscuit', qty: 3, unit: null, unitPrice: null }] });
		expect(d.issues).toEqual(expect.arrayContaining(['customer_new', 'amount_missing', 'product_new']));
		d = setItemPrice(d, 0, 10);
		expect(d.amount).toBe(30);
		expect(d.issues).not.toContain('amount_missing');
		d = setMatchedCustomer(setPaymentMode(d, 'tab'), { id: 'n1', name: 'Gopal' });
		expect(d.issues).toEqual(['product_new']);
	});

	test('stated total stands in while items are unpriced', () => {
		const d = setAmount(sale({ items: [{ name: 'biscuit', qty: 1, unit: null, unitPrice: null }] }), 25);
		expect(d.amount).toBe(25);
		expect(d.issues).not.toContain('amount_missing');
	});

	test('payment amount', () => {
		const d = buildDraft('x', { kind: 'payment', customerName: 'Ramesh', amount: null }, ctx);
		expect(d.issues).toEqual(['amount_missing']);
		expect(setAmount(d, 200).issues).toEqual([]);
	});

	test('nextIssue skips product_new and query about unknown customer', () => {
		expect(nextIssue(sale({ paymentMode: 'cash' }))).toBeNull();
		const q = buildDraft('x', { kind: 'query', customerName: 'Gopal' }, ctx);
		expect(q.issues).toEqual(['customer_new']);
		expect(nextIssue(q)).toBeNull();
	});

	test('recompute is idempotent', () => {
		const d = sale();
		expect(recompute(d)).toEqual(d);
	});
});

describe('buildCommitInput', () => {
	test('blocked while issues remain', () => {
		expect(buildCommitInput(sale())).toBeNull();
	});

	test('fully priced sale maps lines', () => {
		const input = buildCommitInput(sale({ paymentMode: 'tab' }));
		expect(input).toMatchObject({
			kind: 'sale',
			customerId: 'c1',
			paymentMode: 'tab',
			amount: 120,
			items: [{ productId: 'p1', name: 'Rice', qty: 2, unit: 'kg', unitPrice: 60 }]
		});
	});

	test('single unpriced item gets a derived unit price that passes the sum check', () => {
		const d = setAmount(
			sale({ customerName: null, paymentMode: 'cash', items: [{ name: 'biscuit', qty: 3, unit: null, unitPrice: null }] }),
			25
		);
		const input = buildCommitInput(d)!;
		if (input.kind !== 'sale') throw new Error('expected sale');
		const sum = input.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
		expect(Math.abs(sum - input.amount)).toBeLessThan(0.5);
		expect(input.customerId).toBeNull();
	});

	test('several unpriced items collapse into one synthetic line', () => {
		const d = setAmount(
			sale({
				customerName: null,
				paymentMode: 'cash',
				items: [
					{ name: 'biscuit', qty: 3, unit: null, unitPrice: null },
					{ name: 'soap', qty: 1, unit: null, unitPrice: null }
				]
			}),
			50
		);
		const input = buildCommitInput(d)!;
		if (input.kind !== 'sale') throw new Error('expected sale');
		expect(input.items).toEqual([{ productId: null, name: 'biscuit, soap', qty: 1, unit: null, unitPrice: 50 }]);
	});

	test('payment', () => {
		const d = buildDraft('x', { kind: 'payment', customerName: 'Ramesh', amount: 200 }, ctx);
		expect(buildCommitInput(d)).toMatchObject({ kind: 'payment', customerId: 'c1', amount: 200 });
	});
});

describe('parseYesNo', () => {
	test('english and hindi', () => {
		for (const s of ['yes', 'Yeah', 'ok', 'okay.', 'haan', 'हाँ', 'हां', 'जी', 'theek hai', 'ठीक है']) {
			expect(parseYesNo(s)).toBe('yes');
		}
		for (const s of ['no', 'nope', 'nahi', 'नहीं', 'nahin']) expect(parseYesNo(s)).toBe('no');
		expect(parseYesNo('Ramesh')).toBeNull();
		expect(parseYesNo('')).toBeNull();
	});
});

describe('parsePaymentMode', () => {
	test('cash vs tab', () => {
		for (const s of ['cash', 'paid', 'nagad', 'नकद', 'चुकता']) expect(parsePaymentMode(s)).toBe('cash');
		for (const s of ['udhaar', 'उधार', 'tab', 'khata mein', 'खाता']) expect(parsePaymentMode(s)).toBe('tab');
		expect(parsePaymentMode('cash nahi udhaar')).toBeNull();
		expect(parsePaymentMode('kya')).toBeNull();
	});
});

describe('parseNumber', () => {
	test('digits', () => {
		expect(parseNumber('250')).toBe(250);
		expect(parseNumber('₹1,250 rupaye')).toBe(1250);
		expect(parseNumber('12.5')).toBe(12.5);
		expect(parseNumber('२५०')).toBe(250);
		expect(parseNumber('kuch nahi')).toBeNull();
	});
	test('hindi words', () => {
		expect(parseNumber('do sau pachaas')).toBe(250);
		expect(parseNumber('ek sau')).toBe(100);
		expect(parseNumber('sau rupaye')).toBe(100);
		expect(parseNumber('dedh sau')).toBe(150);
		expect(parseNumber('dhai sau')).toBe(250);
		expect(parseNumber('dhai')).toBe(2.5);
		expect(parseNumber('dedh')).toBe(1.5);
		expect(parseNumber('ek hazaar paanch sau')).toBe(1500);
		expect(parseNumber('dhai hazaar')).toBe(2500);
		expect(parseNumber('das hazaar')).toBe(10000);
		expect(parseNumber('saat')).toBe(7);
		expect(parseNumber('saath')).toBe(60);
		expect(parseNumber('सौ')).toBe(100);
		expect(parseNumber('दो सौ पचास')).toBe(250);
		expect(parseNumber('ढाई सौ')).toBe(250);
		expect(parseNumber('ninyanve')).toBe(99);
	});
	test('english words', () => {
		expect(parseNumber('twenty')).toBe(20);
		expect(parseNumber('one hundred and twenty')).toBe(120);
		expect(parseNumber('two thousand five hundred')).toBe(2500);
		expect(parseNumber('fifty rupees')).toBe(50);
	});
	test('only the first number run is used', () => {
		expect(parseNumber('50 rupaye 3 kilo')).toBe(50);
	});
	test('number table has no conflicting words', () => {
		expect(() => buildNumberTable()).not.toThrow();
	});
});

describe('parseCandidate', () => {
	const cands = [
		{ id: 'a', name: 'Ramesh Kumar', score: 0.8 },
		{ id: 'b', name: 'Rakesh', score: 0.7 }
	];
	test('picks by name', () => {
		expect(parseCandidate('Rakesh', cands)).toEqual({ kind: 'candidate', match: cands[1] });
		expect(parseCandidate('रमेश कुमार', cands)).toEqual({ kind: 'candidate', match: cands[0] });
		expect(parseCandidate('Ramesh wala', cands)).toEqual({ kind: 'candidate', match: cands[0] });
	});
	test('new customer', () => {
		expect(parseCandidate('new customer', cands)).toEqual({ kind: 'new' });
		expect(parseCandidate('naya', cands)).toEqual({ kind: 'new' });
	});
	test('unrecognised', () => {
		expect(parseCandidate('banana', cands)).toBeNull();
	});
});

describe('composeDuesAnswer', () => {
	const bal = (name: string, due: number): CustomerBalance => ({ id: name, name, phone: null, due, lastActivity: null });
	test('single customer', () => {
		expect(composeDuesAnswer('en-IN', { customerName: 'Ramesh', total: 150, customers: [bal('Ramesh', 150)] })).toBe(
			'Ramesh owes ₹150.'
		);
		expect(composeDuesAnswer('hi-IN', { customerName: 'Ramesh', total: 0, customers: [bal('Ramesh', 0)] })).toContain('Ramesh');
	});
	test('everyone', () => {
		const text = composeDuesAnswer('en-IN', {
			total: 1240,
			customers: [bal('Ramesh', 500), bal('Sunita', 740)]
		});
		expect(text).toBe('Total ₹1,240 is due. Highest is Sunita, ₹740.');
		expect(composeDuesAnswer('hi-IN', { total: 0, customers: [] })).toContain('बाकी');
		expect(text.length).toBeLessThan(200);
	});
});

test('format and rupees', () => {
	expect(format('{name} owes {amount}', { name: 'Raju', amount: rupees(1240) })).toBe('Raju owes ₹1,240');
	expect(format('{missing}', {})).toBe('{missing}');
});

test('Draft type accepts server output', () => {
	const d: Draft = sale();
	expect(d.statedTotal).toBeNull();
});
