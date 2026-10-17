import { expect, test } from 'bun:test';
import { flagDuplicates, jobState, parseAmount, parseExtraction } from './import-parse.js';

test('parses clean result and the full results body', () => {
	const result = { customers: [{ name: 'Ramesh', amount_due: 250 }, { name: 'सीता', amount_due: 80.5 }] };
	const a = parseExtraction(result).rows;
	expect(a.map((r) => [r.name, r.amount])).toEqual([['Ramesh', 250], ['सीता', 80.5]]);
	expect(parseExtraction({ type: 'extract', result, annotations: {} }).rows).toEqual(a);
});

test('tolerates garbage and missing fields', () => {
	expect(parseExtraction(null).rows).toEqual([]);
	expect(parseExtraction({ customers: 'x' }).rows).toEqual([]);
	const rows = parseExtraction({
		customers: [null, 5, { amount_due: 3 }, { name: '  ' }, { name: 'Gita' }, { name: 'Neg', amount_due: -20 }]
	}).rows;
	expect(rows).toEqual([{ name: 'Gita', amount: 0, duplicateOf: null }]);
});

test('amount strings', () => {
	expect(parseAmount('₹1,200/-')).toBe(1200);
	expect(parseAmount('Rs. 50.5')).toBe(50.5);
	expect(parseAmount('१२०')).toBe(120);
	expect(parseAmount('')).toBe(0);
	expect(parseAmount('abc')).toBe(0);
	expect(parseAmount('-5')).toBe(-5);
});

test('duplicates flagged, not merged', () => {
	const rows = parseExtraction({
		customers: [{ name: 'Ram Lal', amount_due: 10 }, { name: 'Shyam', amount_due: 5 }, { name: ' ram  lal.', amount_due: 20 }]
	}).rows;
	expect(rows.map((r) => r.duplicateOf)).toEqual([null, null, 0]);
	expect(flagDuplicates([{ name: 'a' }, { name: 'A' }, { name: '' }])).toEqual([null, 0, null]);
});

test('jobState', () => {
	expect(jobState('completed')).toBe('done');
	expect(jobState('partially_completed')).toBe('done');
	expect(jobState('rejected')).toBe('failed');
	expect(jobState('running')).toBe('pending');
});
