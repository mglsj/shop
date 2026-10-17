import { expect, test } from 'bun:test';
import { isHindiOrEnglish } from './script.js';

test('accepts Hindi, English, Hinglish, numbers and ₹', () => {
	expect(isHindiOrEnglish('Ramesh took 2 kilo rice for ₹120.')).toBe(true);
	expect(isHindiOrEnglish('रमेश ने दो किलो चावल उधार लिया।')).toBe(true);
	expect(isHindiOrEnglish('रमेश ने 2 kilo rice लिया')).toBe(true);
	expect(isHindiOrEnglish('')).toBe(true);
});

test('rejects other scripts', () => {
	expect(isHindiOrEnglish('رمیش نے چاول لیا')).toBe(false); // Urdu
	expect(isHindiOrEnglish('ਰਮੇਸ਼ ਨੇ ਚੌਲ ਲਏ')).toBe(false); // Punjabi
	expect(isHindiOrEnglish('রমেশ চাল নিল')).toBe(false); // Bengali
	expect(isHindiOrEnglish('Ramesh رمیش')).toBe(false);
});
