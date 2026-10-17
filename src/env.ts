import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'The database connection string.' },
	SARVAM_API_KEY: {
		description: 'Sarvam AI API key (api-subscription-key). Voice features are disabled without it.',
		schema: (value) => value || undefined
	}
});
