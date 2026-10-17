import { json } from '@sveltejs/kit';
import { LedgerError } from '#lib/server/ledger-core.js';

/** Parse a JSON object body; returns null on bad JSON / non-object. */
export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const b = await request.json();
		return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

export const badRequest = (code: string, message: string) =>
	json({ error: { code, message } }, { status: 400 });

/** Run a handler, mapping LedgerError to 400. */
export async function guarded(fn: () => Promise<Response>): Promise<Response> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof LedgerError) return badRequest(e.code, e.message);
		throw e;
	}
}
