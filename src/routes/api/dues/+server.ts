import { json } from '@sveltejs/kit';
import { guarded } from '#lib/server/api.js';
import { findDues } from '#lib/server/ledger.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) =>
	guarded(async () => json(await findDues(url.searchParams.get('customerId') || undefined)));
