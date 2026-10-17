import { describe, expect, test } from 'bun:test';
import { buildReminderMessage, normalisePhone, whatsappUrl } from './reminder.js';

describe('normalisePhone', () => {
	test('prepends 91 to a 10-digit Indian number', () => {
		expect(normalisePhone('98765 43210')).toBe('919876543210');
		expect(normalisePhone('+91 98765-43210')).toBe('919876543210');
	});

	test('strips a single leading 0', () => {
		expect(normalisePhone('09876543210')).toBe('919876543210');
	});

	test('strips a leading 00 (international prefix)', () => {
		expect(normalisePhone('00919876543210')).toBe('919876543210');
	});

	test('keeps a 12-digit number starting with 91', () => {
		expect(normalisePhone('919876543210')).toBe('919876543210');
	});

	test('returns null for missing or invalid numbers', () => {
		expect(normalisePhone(null)).toBeNull();
		expect(normalisePhone('')).toBeNull();
		expect(normalisePhone('12345')).toBeNull();
		expect(normalisePhone('1234567890123')).toBeNull();
	});
});

describe('whatsappUrl', () => {
	test('targets the normalised number with an encoded message', () => {
		const url = whatsappUrl('098765 43210', 'Hi & bye');
		expect(url).toBe('https://wa.me/919876543210?text=Hi%20%26%20bye');
	});

	test('omits the recipient when the phone is null or invalid', () => {
		expect(whatsappUrl(null, 'Hi')).toBe('https://wa.me/?text=Hi');
		expect(whatsappUrl('123', 'Hi')).toBe('https://wa.me/?text=Hi');
	});
});

describe('buildReminderMessage', () => {
	const input = { customerName: 'Ramesh', due: 1234567, shopName: 'Sharma Store' };

	test('Hindi message names the customer, shop and formatted amount', () => {
		const msg = buildReminderMessage('hi-IN', input);
		expect(msg).toContain('नमस्ते Ramesh जी');
		expect(msg).toContain('Sharma Store');
		expect(msg).toContain('₹12,34,567');
		expect(msg).toContain('धन्यवाद');
	});

	test('English message names the customer, shop and formatted amount', () => {
		const msg = buildReminderMessage('en-IN', input);
		expect(msg).toContain('Hello Ramesh');
		expect(msg).toContain('Sharma Store');
		expect(msg).toContain('₹12,34,567');
		expect(msg).toContain('Thank you');
	});

	test('the two languages produce different messages', () => {
		expect(buildReminderMessage('hi-IN', input)).not.toBe(buildReminderMessage('en-IN', input));
	});
});
