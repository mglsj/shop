import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description:
			'libSQL URL: file:local.db for local development, libsql://<db>.turso.io on Vercel (a local file does not persist there).'
	},
	DATABASE_AUTH_TOKEN: {
		description: 'Turso auth token. Required for remote libsql:// URLs.',
		schema: (value) => value || undefined
	},
	SARVAM_API_KEY: {
		description: 'Sarvam AI API key (api-subscription-key). Voice features are disabled without it.',
		schema: (value) => value || undefined
	}
});
