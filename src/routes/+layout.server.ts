import { redirect } from '@sveltejs/kit';
import { getShop } from '#lib/server/shop.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ url }) => {
	const shop = await getShop();
	const onboarding = url.pathname.startsWith('/onboarding');
	if (!shop && !onboarding) redirect(307, '/onboarding');
	return { shop };
};
