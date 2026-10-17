import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const remote = url.startsWith('libsql:') || url.startsWith('https:');

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	// Turso needs the auth token; a local file does not.
	...(remote
		? {
				dialect: 'turso' as const,
				dbCredentials: { url, authToken: process.env.DATABASE_AUTH_TOKEN }
			}
		: { dialect: 'sqlite' as const, dbCredentials: { url } }),
	verbose: true,
	strict: true
});
