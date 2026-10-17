import { expect, test } from 'bun:test';
import { dictionaries } from './i18n.js';

test('English and Hindi define the same message keys', () => {
	const en = Object.keys(dictionaries['en-IN']).sort();
	const hi = Object.keys(dictionaries['hi-IN']).sort();
	expect(hi).toEqual(en);
});
