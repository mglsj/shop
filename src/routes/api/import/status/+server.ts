import { json } from '@sveltejs/kit';
import { jobState, parseExtraction } from '#lib/import-parse.js';
import { docaiErrorCode, getExtractionResult, getJobStatus } from '#lib/server/sarvam/docai.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const jobId = url.searchParams.get('jobId');
	if (!jobId) return json({ error: { code: 'no_job', message: 'jobId required' } }, { status: 400 });
	try {
		const { status } = await getJobStatus(jobId);
		const state = jobState(status);
		if (state === 'pending') return json({ state });
		if (state === 'failed') {
			return json({ state, error: { code: 'extract_failed', message: `Extraction ${status}` } });
		}
		const { rows } = parseExtraction(await getExtractionResult(jobId));
		return json({ state, rows });
	} catch (e) {
		const code = docaiErrorCode(e);
		return json({ state: 'failed', error: { code, message: e instanceof Error ? e.message : code } });
	}
};
