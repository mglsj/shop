import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import { DATABASE_URL, DATABASE_AUTH_TOKEN } from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
if (DATABASE_URL.startsWith('file:') && process.env.VERCEL) {
	throw new Error('DATABASE_URL must be a remote libsql:// URL on Vercel (the filesystem is read-only/ephemeral).');
}

const client = createClient({ url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN });

export const db = drizzle(client, { schema });
