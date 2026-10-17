// Name matching lives in the client-safe #lib/name-match.ts; re-exported so server imports keep working.
export {
	devanagariToLatin,
	normalizeName,
	similarity,
	resolveEntity,
	AUTO_MATCH,
	ASK_THRESHOLD,
	type Candidate
} from '#lib/name-match.js';
