import { SARVAM_API_KEY } from '$app/env/private';

export const SARVAM_BASE_URL = 'https://api.sarvam.ai';

export class SarvamError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code?: string,
		readonly requestId?: string
	) {
		super(message);
		this.name = 'SarvamError';
	}
}

export function sarvamConfigured() {
	return Boolean(SARVAM_API_KEY);
}

/** Shared fetch wrapper: auth header, JSON/multipart bodies, Sarvam error shape, 429/503 retry. */
export async function sarvamFetch(
	path: string,
	init: { json?: unknown; form?: FormData; method?: string } = {},
	retries = 2
): Promise<Response> {
	if (!SARVAM_API_KEY) throw new SarvamError('SARVAM_API_KEY is not set', 500, 'missing_api_key');

	const headers: Record<string, string> = { 'api-subscription-key': SARVAM_API_KEY };
	let body: BodyInit | undefined;
	if (init.form) body = init.form;
	else if (init.json !== undefined) {
		headers['content-type'] = 'application/json';
		body = JSON.stringify(init.json);
	}

	for (let attempt = 0; ; attempt++) {
		const res = await fetch(SARVAM_BASE_URL + path, {
			method: init.method ?? (body ? 'POST' : 'GET'),
			headers,
			body
		});
		if (res.ok) return res;
		if ((res.status === 429 || res.status === 503) && attempt < retries) {
			await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
			continue;
		}
		const err = await res.json().catch(() => null);
		throw new SarvamError(
			err?.error?.message ?? res.statusText,
			res.status,
			err?.error?.code,
			err?.error?.request_id
		);
	}
}

export async function sarvamJson<T>(path: string, init?: Parameters<typeof sarvamFetch>[1]) {
	return (await sarvamFetch(path, init)).json() as Promise<T>;
}
