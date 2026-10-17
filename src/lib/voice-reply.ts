// Pure, client-safe interpretation of a short spoken answer to ONE clarification question.
import { devanagariToLatin, normalizeName, similarity } from '#lib/name-match.js';
import type { Match } from '#lib/voice-types.js';

/** Lowercase, drop punctuation (keeps letters, digits, Devanagari), split on whitespace. */
function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{N}.\s]/gu, ' ')
		.replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
		.split(/\s+/)
		.filter(Boolean);
}

const keyOf = (word: string) => normalizeName(word);

function wordSet(words: string[]): Set<string> {
	return new Set(words.map(keyOf).filter(Boolean));
}

// ---------- yes / no ----------
const YES = wordSet([
	'yes', 'yeah', 'yep', 'yup', 'ok', 'okay', 'sure', 'haan', 'han', 'ha', 'haa', 'haanji', 'ji', 'jee',
	'theek', 'thik', 'sahi', 'हाँ', 'हां', 'हा', 'जी', 'ठीक', 'सही', 'ओके'
]);
const NO = wordSet([
	'no', 'nope', 'nah', 'nahi', 'nahin', 'nahee', 'na', 'नहीं', 'नही', 'ना', 'नो'
]);

export function parseYesNo(text: string): 'yes' | 'no' | null {
	for (const token of tokenize(text)) {
		const key = keyOf(token);
		if (NO.has(key)) return 'no';
		if (YES.has(key)) return 'yes';
	}
	return null;
}

// ---------- cash / tab ----------
const CASH = wordSet(['cash', 'paid', 'nagad', 'nakad', 'naqd', 'नकद', 'नगद', 'चुकता', 'cukta', 'chukta', 'kash', 'कैश', 'upi', 'gpay', 'paytm', 'phonepe', 'पेड', 'यूपीआई']);
const TAB = wordSet([
	'udhaar', 'udhar', 'udhari', 'उधार', 'उधारी', 'tab', 'khata', 'khate', 'खाता', 'खाते', 'credit', 'likh', 'likho', 'लिख', 'लिखो', 'टैब'
]);

export function parsePaymentMode(text: string): 'cash' | 'tab' | null {
	let cash = false;
	let tab = false;
	for (const token of tokenize(text)) {
		const key = keyOf(token);
		if (CASH.has(key)) cash = true;
		if (TAB.has(key)) tab = true;
	}
	return cash === tab ? null : cash ? 'cash' : 'tab';
}

// ---------- numbers ----------
const HINDI_1_99 = `
ek 1|do 2|teen tin 3|char chaar 4|paanch panch 5|chhe chhah chah che 6|saat sat 7|aath ath 8|nau 9|das dus 10
gyarah gyaarah igyarah 11|barah baarah 12|terah 13|chaudah chaudaah 14|pandrah pandra 15|solah sola 16|satrah satra 17|atharah athara 18|unnis unnees unis 19|bees 20
ikkis ekkis 21|baais baaees bais 22|teis teyis 23|chaubis chaubees 24|pachchis pachis pacchis 25|chhabbis chabbis 26|sattais satais 27|atthais athais 28|untis unatis 29|tees 30
iktis ikatis 31|battis batis 32|taintis tentis 33|chauntis chautis 34|paintis pentis 35|chhattis chattis 36|saintis sentis 37|adtis artis 38|untalis unchalis 39|chalis chaalis 40
iktalis ikatalis 41|bayalis byalis 42|taitalis tentalis 43|chauvalis chavalis 44|paintalis pentalis 45|chhiyalis chiyalis 46|saintalis sentalis 47|adtalis artalis 48|unchas unanchas 49|pachas pachaas 50
ikyavan ikyaavan 51|bavan baavan 52|tirpan trepan 53|chauvan chauvann 54|pachpan pachpann 55|chhappan chappan 56|sattavan satavan 57|atthavan athavan 58|unsath unasath 59|saath sath 60
iksath ikasath 61|baasath basath 62|tirsath tirasath 63|chaunsath chausath 64|painsath pensath 65|chhiyasath chiyasath 66|sadsath sarsath 67|adsath arsath 68|unhattar unahattar 69|sattar 70
ikhattar ikahattar 71|bahattar 72|tihattar 73|chauhattar 74|pachattar 75|chhihattar chihattar 76|satattar 77|athattar 78|unnasi unasi 79|assi 80
ikyasi ikiyasi 81|bayasi 82|tirasi 83|chaurasi 84|pachasi 85|chhiyasi chiyasi 86|sattasi satasi 87|atthasi athasi 88|navasi 89|nabbe 90
ikyanve ikyanbe 91|baanve banve 92|tiranve 93|chauranve 94|pachanve 95|chhiyanve chiyanve 96|sattanve satanve 97|atthanve athanve 98|ninyanve ninanve 99
`;

const ENGLISH_NUMBERS: Record<string, number> = {
	zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
	eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
	eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
	eighty: 80, ninety: 90
};

const DEVANAGARI_NUMBERS: Record<string, number> = {
	एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
	ग्यारह: 11, बारह: 12, तेरह: 13, चौदह: 14, पंद्रह: 15, सोलह: 16, सत्रह: 17, अठारह: 18, उन्नीस: 19,
	बीस: 20, तीस: 30, चालीस: 40, पचास: 50, साठ: 60, सत्तर: 70, अस्सी: 80, नब्बे: 90, पच्चीस: 25
};

/** Lighter than normalizeName: keeps h/th distinctions so saat (7) and saath (60) stay apart. */
function numKey(word: string): string {
	return devanagariToLatin(word)
		.toLowerCase()
		.replace(/[^a-z]/g, '')
		.replace(/aa/g, 'a')
		.replace(/ee/g, 'i')
		.replace(/oo/g, 'u')
		.replace(/(.)\1+/g, '$1');
}

type Piece = { type: 'num'; value: number } | { type: 'mult'; value: number };

/** word key -> piece. Built once; throws in tests if two different numbers share a key. */
export function buildNumberTable(): Map<string, Piece> {
	const table = new Map<string, Piece>();
	const add = (word: string, piece: Piece) => {
		const key = numKey(word);
		if (!key) return;
		const old = table.get(key);
		if (old && (old.type !== piece.type || old.value !== piece.value)) {
			throw new Error(`number word collision: ${word} (${key})`);
		}
		table.set(key, piece);
	};
	for (const row of HINDI_1_99.trim().split(/\s*\|\s*|\n/)) {
		const parts = row.trim().split(/\s+/);
		const value = Number(parts.pop());
		for (const word of parts) add(word, { type: 'num', value });
	}
	for (const [word, value] of Object.entries(ENGLISH_NUMBERS)) add(word, { type: 'num', value });
	for (const [word, value] of Object.entries(DEVANAGARI_NUMBERS)) add(word, { type: 'num', value });
	for (const w of ['sau', 'hundred', 'सौ']) add(w, { type: 'mult', value: 100 });
	for (const w of ['hazaar', 'hazar', 'hajar', 'hajaar', 'thousand', 'हज़ार', 'हजार']) {
		add(w, { type: 'mult', value: 1000 });
	}
	// dedh / dhai are fractional numbers that also work as multipliers: "dedh sau" = 150
	for (const w of ['dedh', 'डेढ़', 'डेढ']) add(w, { type: 'num', value: 1.5 });
	for (const w of ['dhai', 'adhai', 'ढाई']) add(w, { type: 'num', value: 2.5 });
	return table;
}

let TABLE: Map<string, Piece> | null = null;
const CONNECTORS = new Set(['and', 'aur', 'और']);

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

function lookup(token: string): Piece | null {
	TABLE ??= buildNumberTable();
	const key = numKey(token);
	if (!key) return null;
	const exact = TABLE.get(key);
	if (exact) return exact;
	// tolerate STT spelling drift on long words only (short words are too easy to confuse)
	if (key.length < 6) return null;
	let best: Piece | null = null;
	let bestScore = 0;
	let tie = false;
	for (const [k, piece] of TABLE) {
		if (k.length < 5) continue;
		const s = similarity(key, k);
		if (s > bestScore + 1e-9) {
			best = piece;
			bestScore = s;
			tie = false;
		} else if (Math.abs(s - bestScore) <= 1e-9 && piece.value !== best?.value) tie = true;
	}
	return bestScore >= 0.85 && !tie ? best : null;
}

/**
 * Extracts the first run of number tokens: digits ("250", "1,250", "२५०", "12.5") and
 * Hindi/English number words up to thousands ("do sau pachaas" = 250, "dhai hazaar" = 2500,
 * "one hundred and twenty" = 120, "dedh sau" = 150). Returns null when there is none.
 */
export function parseNumber(text: string): number | null {
	const cleaned = text
		.replace(/[₹]/g, ' ')
		.replace(/(\d),(?=\d{3}\b)/g, '$1')
		.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
	const tokens = tokenize(cleaned);

	let total = 0;
	let current = 0;
	let started = false;

	for (const token of tokens) {
		let piece: Piece | null = null;
		if (/^\d+(\.\d+)?$/.test(token)) piece = { type: 'num', value: Number(token) };
		else if (started && CONNECTORS.has(token)) continue;
		else piece = lookup(token);

		if (!piece) {
			if (started) break;
			continue;
		}
		started = true;
		if (piece.type === 'num') {
			current += piece.value;
		} else if (piece.value === 100) {
			current = (current || 1) * 100;
		} else {
			total += (current || 1) * 1000;
			current = 0;
		}
	}
	return started ? total + current : null;
}

// ---------- customer choice ----------
const NEW_WORDS = wordSet(['new', 'naya', 'nayi', 'nai', 'नया', 'नई', 'नयी']);

export type CandidateAnswer = { kind: 'candidate'; match: Match } | { kind: 'new' } | null;

/**
 * Picks one of the offered candidates by comparing the spoken text with their names, or
 * "new customer". Ordinals ("pehla"/"first", "doosra"/"second") are not supported.
 */
export function parseCandidate(text: string, candidates: Match[]): CandidateAnswer {
	const tokens = tokenize(text);
	if (tokens.some((tok) => NEW_WORDS.has(keyOf(tok)))) return { kind: 'new' };

	const spoken = normalizeName(text);
	if (!spoken) return null;
	const scored = candidates
		.map((match) => {
			const full = normalizeName(match.name);
			let score = similarity(spoken, full);
			// a spoken first name or a name inside a longer sentence ("Ramesh wala")
			for (const part of full.split(' ')) {
				for (const tok of tokens.map(keyOf)) score = Math.max(score, similarity(tok, part));
			}
			return { match, score };
		})
		.sort((a, b) => b.score - a.score);
	const [top, second] = scored;
	if (!top || top.score < 0.75) return null;
	if (second && top.score - second.score < 0.1) return null;
	return { kind: 'candidate', match: top.match };
}
