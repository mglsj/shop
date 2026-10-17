import { json } from '@sveltejs/kit';
import { docaiErrorCode, startExtraction } from '#lib/server/sarvam/docai.js';
import { sarvamConfigured } from '#lib/server/sarvam/client.js';
import { getShop } from '#lib/server/shop.js';
import type { RequestHandler } from './$types';

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const err = (code: string, status: number) => json({ error: { code } }, { status });

export const POST: RequestHandler = async ({ request }) => {
	const shop = await getShop();
	if (!shop) return err('no_shop', 400);
	if (!sarvamConfigured()) return err('missing_api_key', 503);

	let image: FormDataEntryValue | null;
	try {
		image = (await request.formData()).get('image');
	} catch {
		return err('no_image', 400);
	}
	if (!(image instanceof Blob) || image.size === 0) return err('no_image', 400);
	if (image.size > MAX_BYTES) return err('file_too_large', 413);
	if (!TYPES.includes(image.type)) return err('unsupported_type', 415);

	try {
		return json(await startExtraction(image, shop.language));
	} catch (e) {
		const code = docaiErrorCode(e);
		return err(code, code === 'insufficient_quota_error' ? 402 : 502);
	}
};
