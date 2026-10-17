import { SarvamError, sarvamJson } from './client.js';

/**
 * Sarvam Document Intelligence ("doc-ai", model sarvam-vision-v1), verified against
 * https://docs.sarvam.ai/openapi/apis.json:
 *   POST /doc-ai/v1/job/extract        multipart: file | upload_ids, schema | config_id, output_format, model
 *                                       -> 201 {job_id, status, run_id}
 *   GET  /doc-ai/v1/job/{id}/status    -> {job_id, status, pipeline, usage, created_at, updated_at}
 *   GET  /doc-ai/v1/job/{id}/results   -> inline JSON {type:'extract', status, usage, result, annotations, version}
 *                                         (409 until terminal). No ZIP, so no unzip step is needed.
 * Errors are RFC 7807 style; we map by HTTP status (402 = out of credits, 403 = bad key).
 */

export const EXTRACTION_SCHEMA = {
	type: 'object',
	description: 'A page of a shopkeeper paper notebook (khata) listing customers and the money they owe.',
	properties: {
		customers: {
			type: 'array',
			description: 'One entry per customer row written on the page, in reading order.',
			items: {
				type: 'object',
				description: 'A single customer line of the notebook.',
				properties: {
					name: {
						type: 'string',
						description: 'Customer name exactly as written in the notebook.'
					},
					amount_due: {
						type: 'number',
						description: 'Amount owed by this customer in rupees. Use 0 if blank or none.'
					}
				}
			}
		}
	}
} as const;

export type DocAiStatus = {
	status: string;
	pages?: { total?: number; processed?: number; failed?: number };
};

export async function startExtraction(file: Blob, _language?: string): Promise<{ jobId: string }> {
	// The extract endpoint has no `language` field (only digitise does); the arg is accepted for API symmetry.
	const form = new FormData();
	const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
	form.append('file', file, `notebook.${ext}`);
	form.append('schema', JSON.stringify(EXTRACTION_SCHEMA));
	form.append('output_format', 'json');
	const res = await sarvamJson<{ job_id: string }>('/doc-ai/v1/job/extract', { form });
	return { jobId: res.job_id };
}

export async function getJobStatus(jobId: string): Promise<DocAiStatus> {
	const res = await sarvamJson<{
		status: string;
		usage?: { pages_total?: number; pages_processed?: number; pages_failed?: number };
	}>(`/doc-ai/v1/job/${encodeURIComponent(jobId)}/status`);
	return {
		status: res.status,
		pages: { total: res.usage?.pages_total, processed: res.usage?.pages_processed, failed: res.usage?.pages_failed }
	};
}

/** Raw results body; pass to parseExtraction (it accepts the whole body or just `result`). */
export async function getExtractionResult(jobId: string): Promise<unknown> {
	return sarvamJson<unknown>(`/doc-ai/v1/job/${encodeURIComponent(jobId)}/results?format=json`);
}

/** Stable error codes for the UI. */
export function docaiErrorCode(e: unknown): string {
	if (e instanceof SarvamError) {
		if (e.code === 'missing_api_key') return 'missing_api_key';
		if (e.status === 402 || e.code === 'insufficient_quota_error') return 'insufficient_quota_error';
		if (e.status === 403 || e.code === 'invalid_api_key_error') return 'invalid_api_key_error';
		if (e.status === 429) return 'rate_limit_exceeded_error';
		if (e.status === 413) return 'file_too_large';
		if (e.status === 404) return 'job_not_found';
		if (e.status === 400) return 'invalid_request_error';
		return 'upstream_error';
	}
	return 'internal_error';
}
