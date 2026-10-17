// Client-safe and server-safe: pure functions only (no env, no db).
import type { EntityResolution, Match } from '#lib/voice-types.js';

const CONSONANTS: Record<string, string> = {
	क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
	ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n', त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
	प: 'p', फ: 'f', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v', श: 'sh',
	ष: 'sh', स: 's', ह: 'h', ळ: 'l'
};
const VOWELS: Record<string, string> = {
	अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au'
};
const MATRAS: Record<string, string> = {
	'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ृ': 'ri'
};
const VIRAMA = '्';
const NUKTA = '़';
const NASALS = 'ंँः';

/** Rough Devanagari -> Latin, good enough for fuzzy name matching (not for display). */
export function devanagariToLatin(input: string): string {
	const chars = [...input.normalize('NFC')].filter((c) => c !== NUKTA);
	let out = '';
	for (let i = 0; i < chars.length; i++) {
		const c = chars[i];
		const next = chars[i + 1];
		if (c in CONSONANTS) {
			out += CONSONANTS[c];
			if (next === VIRAMA) i++;
			else if (next && next in MATRAS) out += MATRAS[chars[++i]];
			// inherent "a" unless the consonant ends the word (schwa deletion)
			else if (next && /[ऀ-ॿ]/.test(next)) out += 'a';
		} else if (c in VOWELS) out += VOWELS[c];
		else if (c === 'ं' || c === 'ँ') out += 'n';
		else if (c === 'ः') out += 'h';
		else if (!NASALS.includes(c)) out += c;
	}
	return out;
}

/** Collapses spelling variants (Ramesh/Rameshh/रमेश, Shyam/Shaam, Vijay/Wijay) to one key. */
export function normalizeName(name: string): string {
	return devanagariToLatin(name)
		.toLowerCase()
		.replace(/[^a-z\s]/g, '')
		.replace(/aa/g, 'a')
		.replace(/ee/g, 'i')
		.replace(/oo/g, 'u')
		.replace(/w/g, 'v')
		.replace(/z/g, 'j')
		.replace(/q/g, 'k')
		.replace(/x/g, 'ks')
		.replace(/(.)\1+/g, '$1')
		.replace(/ph/g, 'f')
		.replace(/([bcdgjkpstr])h+/g, '$1')
		.replace(/y/g, 'i')
		.replace(/(.)\1+/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();
}

function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		for (let j = 1; j <= b.length; j++) {
			cur[j] = Math.min(
				prev[j] + 1,
				cur[j - 1] + 1,
				prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
			);
		}
		prev = cur;
	}
	return prev[b.length];
}

export function similarity(a: string, b: string): number {
	if (!a || !b) return 0;
	return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/** A bare first name scores slightly lower than a full-name match. */
function scoreAlias(query: string, alias: string): number {
	let best = similarity(query, alias);
	const tokens = alias.split(' ');
	if (tokens.length > 1 && !query.includes(' ')) {
		for (const token of tokens) best = Math.max(best, similarity(query, token) * 0.95);
	}
	return best;
}

export type Candidate = { id: string; name: string; aliases?: string[] };

export const AUTO_MATCH = 0.85;
export const ASK_THRESHOLD = 0.6;

export function resolveEntity(spoken: string, pool: Candidate[]): EntityResolution {
	const query = normalizeName(spoken);
	const scored: Match[] = pool
		.map((c) => ({
			id: c.id,
			name: c.name,
			score: Math.max(
				...[c.name, ...(c.aliases ?? [])].map((a) => scoreAlias(query, normalizeName(a)))
			)
		}))
		.filter((m) => m.score >= ASK_THRESHOLD)
		.sort((a, b) => b.score - a.score);

	const [top, second] = scored;
	if (!top) return { spoken, status: 'new', match: null, candidates: [] };
	const clear = !second || second.score < AUTO_MATCH || top.score - second.score >= 0.1;
	if (top.score >= AUTO_MATCH && clear) {
		return { spoken, status: 'matched', match: top, candidates: [] };
	}
	return { spoken, status: 'ambiguous', match: null, candidates: scored.slice(0, 3) };
}
