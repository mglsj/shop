import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// STT + LLM (+ a possible retry) can exceed Vercel's default 10 s; Mumbai is closest to Sarvam and the users.
			adapter: adapter({ runtime: 'nodejs22.x', maxDuration: 60, regions: ['bom1'] })
		})
	]
});
