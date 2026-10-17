<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Camera, Loader, Trash2 } from '@lucide/svelte';
	import { t, type MessageKey } from '#lib/i18n.js';
	import { flagDuplicates } from '#lib/import-parse.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card } from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const lang = $derived(data.language);

	const POLL_MS = 3000;
	const MAX_POLLS = 60; // ~3 minutes

	type Row = { name: string; amount: number | null };
	type Summary = {
		created: number;
		updated: number;
		totalDue: number;
		skipped: { name: string }[];
		failed: { name: string }[];
	};

	let phase = $state<'idle' | 'uploading' | 'reading' | 'review' | 'saving' | 'done'>('idle');
	let rows = $state<Row[]>([]);
	let errorCode = $state<string | null>(null);
	let summary = $state<Summary | null>(null);
	let fileInput: HTMLInputElement | undefined = $state();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let cancelled = false;

	const dups = $derived(flagDuplicates(rows));

	function fail(code: string) {
		errorCode = code;
		phase = rows.length ? 'review' : 'idle';
	}

	function errorText(code: string) {
		const key = `import.error.${code}` as MessageKey;
		const text = t(lang, key);
		return text ?? t(lang, 'import.error.generic');
	}

	async function onPick(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		errorCode = null;
		rows = [];
		phase = 'uploading';
		try {
			const body = new FormData();
			body.append('image', file);
			const res = await fetch('/api/import/start', { method: 'POST', body });
			const out = await res.json().catch(() => null);
			if (!res.ok || !out?.jobId) return fail(out?.error?.code ?? 'generic');
			phase = 'reading';
			poll(out.jobId, 0);
		} catch {
			fail('generic');
		}
	}

	async function poll(jobId: string, n: number) {
		if (cancelled) return;
		if (n >= MAX_POLLS) return fail('timeout');
		try {
			const res = await fetch(`/api/import/status?jobId=${encodeURIComponent(jobId)}`);
			const out = await res.json().catch(() => null);
			if (cancelled) return;
			if (!res.ok || !out) return fail('generic');
			if (out.state === 'done') {
				rows = (out.rows as { name: string; amount: number }[]).map((r) => ({ name: r.name, amount: r.amount }));
				phase = 'review';
				return;
			}
			if (out.state === 'failed') return fail(out.error?.code ?? 'generic');
		} catch {
			// transient network error: keep polling
		}
		timer = setTimeout(() => poll(jobId, n + 1), POLL_MS);
	}

	async function save() {
		const payload = rows
			.map((r) => ({ name: r.name.trim(), amount: Number(r.amount) || 0 }))
			.filter((r) => r.name && r.amount >= 0);
		if (!payload.length) return;
		errorCode = null;
		phase = 'saving';
		try {
			const res = await fetch('/api/import/commit', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ rows: payload })
			});
			const out = await res.json().catch(() => null);
			if (!res.ok || !out) return fail(out?.error?.code ?? 'generic');
			summary = out;
			phase = 'done';
		} catch {
			fail('generic');
		}
	}

	function reset() {
		rows = [];
		summary = null;
		errorCode = null;
		phase = 'idle';
	}

	onDestroy(() => {
		cancelled = true;
		clearTimeout(timer);
	});
</script>

<main class="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-4">
	<header class="flex items-center justify-between gap-3">
		<a href="/" class="inline-flex h-12 items-center rounded-md px-3 text-lg font-medium underline">
			{t(lang, 'import.back')}
		</a>
		<h1 class="text-2xl font-bold">{t(lang, 'import.title')}</h1>
	</header>

	<input
		bind:this={fileInput}
		type="file"
		accept="image/*,application/pdf"
		capture="environment"
		class="hidden"
		onchange={onPick}
	/>

	{#if errorCode}
		<p role="alert" class="rounded-md border-2 border-destructive p-3 text-lg font-medium text-destructive">
			{errorText(errorCode)}
		</p>
	{/if}

	{#if phase === 'idle'}
		<p class="text-center text-lg text-muted-foreground">{t(lang, 'import.hint')}</p>
		<Button size="lg" class="h-20 gap-3 text-xl" onclick={() => fileInput?.click()}>
			<Camera class="size-8" />
			{t(lang, 'import.scan')}
		</Button>
	{:else if phase === 'uploading' || phase === 'reading'}
		<div class="flex flex-col items-center gap-4 py-16" role="status">
			<Loader class="size-14 animate-spin" />
			<p class="text-xl">{t(lang, phase === 'uploading' ? 'import.uploading' : 'import.reading')}</p>
		</div>
	{:else if phase === 'review' || phase === 'saving'}
		<h2 class="text-xl font-semibold">{t(lang, 'import.review')}</h2>
		{#if rows.length === 0}
			<p class="py-6 text-center text-lg text-muted-foreground">{t(lang, 'import.empty')}</p>
		{/if}
		<ul class="flex flex-col gap-3">
			{#each rows as row, i (i)}
				<li>
					<Card class="gap-2 border-2 p-3 {dups[i] !== null ? 'border-amber-500 bg-amber-50 dark:bg-amber-950' : ''}">
						<div class="flex items-center gap-2">
							<Input
								bind:value={row.name}
								aria-label={t(lang, 'import.name')}
								maxlength={100}
								class="h-14 flex-1 text-lg"
							/>
							<Button
								type="button"
								variant="outline"
								size="icon"
								class="size-14 shrink-0"
								aria-label={t(lang, 'import.delete')}
								onclick={() => rows.splice(i, 1)}
							>
								<Trash2 class="size-6" />
							</Button>
						</div>
						<Input
							bind:value={row.amount}
							type="number"
							inputmode="decimal"
							min="0"
							step="any"
							aria-label={t(lang, 'import.amount')}
							placeholder={t(lang, 'import.amount')}
							class="h-14 text-lg"
						/>
						{#if dups[i] !== null}
							<p class="text-base font-medium text-amber-700 dark:text-amber-300">{t(lang, 'import.duplicate')}</p>
						{/if}
					</Card>
				</li>
			{/each}
		</ul>
		<Button size="lg" class="h-16 text-xl" disabled={phase === 'saving' || rows.length === 0} onclick={save}>
			{t(lang, phase === 'saving' ? 'import.adding' : 'import.add')}
		</Button>
		<Button variant="outline" size="lg" class="h-14 text-lg" onclick={reset}>{t(lang, 'import.rescan')}</Button>
	{:else if phase === 'done' && summary}
		<Card class="gap-3 border-2 p-4">
			<h2 class="text-2xl font-bold">{t(lang, 'import.done')}</h2>
			<p class="text-lg">{t(lang, 'import.created')}: <b>{summary.created}</b></p>
			<p class="text-lg">{t(lang, 'import.updated')}: <b>{summary.updated}</b></p>
			<p class="text-lg">{t(lang, 'import.total')}: <b>₹{summary.totalDue.toLocaleString('en-IN')}</b></p>
			{#if summary.skipped.length}
				<p class="text-base text-muted-foreground">
					{t(lang, 'import.skipped')}: {summary.skipped.map((s) => s.name).join(', ')}
				</p>
			{/if}
			{#if summary.failed.length}
				<p role="alert" class="text-base font-medium text-destructive">
					{t(lang, 'import.failed')}: {summary.failed.map((s) => s.name).join(', ')}
				</p>
			{/if}
		</Card>
		<Button href="/tabs" size="lg" class="h-16 text-xl">{t(lang, 'import.viewTabs')}</Button>
		<Button variant="outline" size="lg" class="h-14 text-lg" onclick={reset}>{t(lang, 'import.rescan')}</Button>
	{/if}
</main>
