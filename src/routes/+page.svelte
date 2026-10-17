<script lang="ts">
	import { Settings } from '@lucide/svelte';
	import { t } from '#lib/i18n.js';
	import { speak, stopSpeaking } from '#lib/speak.js';
	import { nextIssue } from '#lib/voice-draft.js';
	import type { Committed, Draft, VoiceAnswer } from '#lib/voice-types.js';
	import VoiceRecorder from '#lib/components/voice-recorder.svelte';
	import DraftCard from '#lib/components/draft-card.svelte';
	import Receipt from '#lib/components/draft/receipt.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	// layout guarantees a shop exists past onboarding
	const shop = $derived(data.shop!);

	let draft = $state<Draft | null>(null);
	let answer = $state<VoiceAnswer | null>(null);
	/** Bumped per new draft so the card (and its spoken question) starts fresh. */
	let draftId = $state(0);
	let receipt = $state<Committed | null>(null);
	let card = $state<{ answerBy: (transcript: string) => Promise<void> }>();

	// While a draft has an open question, the next recording is the answer to it.
	const mode = $derived(draft && nextIssue(draft) ? 'answer' : 'command');

	function onstart() {
		stopSpeaking();
		receipt = null; // undo is available only until the next recording starts
	}

	function ondraft(d: Draft | null, a?: VoiceAnswer) {
		draftId += 1;
		draft = d;
		answer = a ?? null;
		if (a) void speak(a.text);
		else if (d?.intent === 'clarify' && d.question) void speak(d.question);
		else if (d?.intent === 'unknown') void speak(t(shop.language, 'draft.unknown'));
	}

	function oncommitted(result: Committed) {
		draft = null;
		answer = null;
		receipt = result;
		void speak(result.spoken);
	}
</script>

<main class="mx-auto flex min-h-dvh max-w-md flex-col gap-8 p-4">
	<header class="flex items-start justify-between gap-2">
		<div>
			<h1 class="text-2xl font-bold">{t(shop.language, 'home.greeting')}, {shop.name}</h1>
			<p class="text-muted-foreground">{t(shop.language, 'home.tagline')}</p>
		</div>
		<a
			href="/onboarding"
			aria-label={t(shop.language, 'home.settings')}
			class="flex size-12 shrink-0 items-center justify-center rounded-full border text-muted-foreground"
		>
			<Settings class="size-6" />
		</a>
	</header>

	<VoiceRecorder
		language={shop.language}
		{mode}
		{ondraft}
		{onstart}
		onanswer={(transcript) => card?.answerBy(transcript)}
	/>

	{#if draft}
		{#key draftId}
			<DraftCard
				bind:this={card}
				bind:draft
				bind:answer
				language={shop.language}
				ondismiss={() => (draft = null)}
				{oncommitted}
			/>
		{/key}
	{/if}

	{#if receipt}
		{#key receipt.txnId}
			<Receipt txnId={receipt.txnId} message={receipt.message} language={shop.language} />
		{/key}
	{/if}
</main>
