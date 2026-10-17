<script lang="ts">
	import { Mic, Square, Loader } from '@lucide/svelte';
	import type { Language } from '#lib/languages.js';
	import { t, type MessageKey } from '#lib/i18n.js';
	import type { Draft, VoiceAnswer } from '#lib/voice-types.js';

	/** Sarvam REST STT accepts clips under 30 s. */
	const MAX_SECONDS = 28;

	let {
		language,
		mode = 'command',
		ondraft,
		onanswer,
		onstart
	}: {
		language: Language;
		/** 'answer': the recording replies to a pending question; only the transcript comes back. */
		mode?: 'command' | 'answer';
		ondraft: (draft: Draft | null, answer?: VoiceAnswer) => void;
		onanswer?: (transcript: string) => void;
		onstart?: () => void;
	} = $props();

	function errorKey(code: unknown): MessageKey {
		switch (code) {
			case 'insufficient_quota_error':
				return 'clarify.error.quota';
			case 'invalid_api_key_error':
			case 'missing_api_key':
				return 'voice.error.noKey';
			case 'rate_limit_exceeded_error':
				return 'clarify.error.rate';
			default:
				return 'voice.error.generic';
		}
	}

	let phase = $state<'idle' | 'recording' | 'processing'>('idle');
	let error = $state<MessageKey | null>(null);
	let seconds = $state(0);

	let recorder: MediaRecorder | null = null;
	let stream: MediaStream | null = null;
	let chunks: Blob[] = [];
	let timer: ReturnType<typeof setInterval> | undefined;

	function cleanup() {
		clearInterval(timer);
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
	}

	async function start() {
		error = null;
		onstart?.();
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			error = 'voice.error.mic';
			return;
		}
		chunks = [];
		recorder = new MediaRecorder(stream);
		recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
		recorder.onstop = () => send(new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }));
		recorder.start();
		seconds = 0;
		phase = 'recording';
		timer = setInterval(() => {
			seconds += 1;
			if (seconds >= MAX_SECONDS) stop();
		}, 1000);
	}

	function stop() {
		if (recorder?.state === 'recording') recorder.stop();
		cleanup();
		phase = 'processing';
	}

	async function send(audio: Blob) {
		try {
			const body = new FormData();
			body.set('audio', audio);
			const answering = mode === 'answer';
			const res = await fetch(answering ? '/api/voice?mode=answer' : '/api/voice', {
				method: 'POST',
				body
			});
			const data = await res.json();
			if (!res.ok) {
				error = errorKey(data?.error?.code);
			} else if (answering) {
				if (typeof data.transcript === 'string' && data.transcript.trim()) onanswer?.(data.transcript);
				else error = 'voice.nothingHeard';
			} else if (!data.draft) {
				error = 'voice.nothingHeard';
				ondraft(null);
			} else {
				ondraft(data.draft, data.answer ?? undefined);
			}
		} catch {
			error = 'voice.error.generic';
		} finally {
			phase = 'idle';
		}
	}

	$effect(() => cleanup);
</script>

<div class="flex flex-col items-center gap-3">
	<button
		type="button"
		onclick={phase === 'recording' ? stop : start}
		disabled={phase === 'processing'}
		aria-label={t(language, 'voice.tap')}
		class="flex size-32 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 disabled:opacity-60 {phase ===
		'recording'
			? 'animate-pulse bg-destructive'
			: ''}"
	>
		{#if phase === 'recording'}
			<Square class="size-12" />
		{:else if phase === 'processing'}
			<Loader class="size-12 animate-spin" />
		{:else}
			<Mic class="size-14" />
		{/if}
	</button>

	<p class="text-lg font-medium" aria-live="polite">
		{#if phase === 'recording'}
			{t(language, 'voice.recording')} ({seconds}s)
		{:else if phase === 'processing'}
			{t(language, 'voice.processing')}
		{:else if mode === 'answer'}
			{t(language, 'clarify.answerHint')}
		{:else}
			{t(language, 'voice.tap')}
		{/if}
	</p>

	{#if error}
		<p role="alert" class="text-center text-destructive">{t(language, error)}</p>
	{/if}
</div>
