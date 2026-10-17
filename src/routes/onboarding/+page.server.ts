import { fail, redirect } from '@sveltejs/kit';
import { LANGUAGES, type Language } from '#lib/languages.js';
import { saveShop } from '#lib/server/shop.js';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const language = String(data.get('language') ?? '');
		if (!LANGUAGES.includes(language as Language)) return fail(400, { name, error: 'language' });
		if (!name) return fail(400, { name, language, error: 'name' });
		await saveShop({ name, language: language as Language });
		redirect(303, '/');
	}
};
