<script lang="ts">
	import { CircleCheck, Undo2 } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { t } from '#lib/i18n.js';
	import type { Language } from '#lib/languages.js';

	let { txnId, message, language }: { txnId: string; message: string; language: Language } =
		$props();

	let phase = $state<'saved' | 'busy' | 'undone'>('saved');
	let error = $state<string | null>(null);

	async function undo() {
		phase = 'busy';
		error = null;
		try {
			const res = await fetch('/api/commit/undo', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ txnId })
			});
			if (res.ok) {
				phase = 'undone';
				return;
			}
			const data = await res.json().catch(() => null);
			error = data?.error?.message ?? t(language, 'voice.error.generic');
		} catch {
			error = t(language, 'voice.error.generic');
		}
		phase = 'saved';
	}
</script>

<div class="flex items-center justify-between gap-3 rounded-xl border bg-card p-4" role="status">
	{#if phase === 'undone'}
		<p class="text-lg font-medium">{t(language, 'clarify.undone')}</p>
	{:else}
		<div class="flex items-center gap-3">
			<CircleCheck class="size-8 shrink-0 text-green-600" />
			<div>
				<p class="text-lg font-semibold">{t(language, 'clarify.saved')}</p>
				<p class="text-muted-foreground">{message}</p>
			</div>
		</div>
		<Button
			type="button"
			variant="outline"
			size="lg"
			class="h-14 shrink-0 text-lg"
			disabled={phase === 'busy'}
			onclick={undo}
		>
			<Undo2 />
			{t(language, 'clarify.undo')}
		</Button>
	{/if}
</div>
{#if error}
	<p role="alert" class="text-center text-destructive">{error}</p>
{/if}
