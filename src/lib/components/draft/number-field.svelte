<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { t } from '#lib/i18n.js';
	import type { Language } from '#lib/languages.js';
	import { parseNumber } from '#lib/voice-reply.js';

	let {
		label,
		language,
		value = null,
		onsubmit
	}: {
		label: string;
		language: Language;
		value?: number | null;
		onsubmit: (n: number) => void;
	} = $props();

	let text = $derived(value == null ? '' : String(value));
	let invalid = $state(false);

	function submit(e: SubmitEvent) {
		e.preventDefault();
		// plain digits first ("1,250" thousands, "12,5" decimal comma); falls back to number words
		const plain = text.replace(/(\d),(?=\d{3}\b)/g, '$1').replace(',', '.');
		const n = Number(plain) || parseNumber(text);
		invalid = !(n != null && Number.isFinite(n) && n > 0);
		if (!invalid) onsubmit(n as number);
	}
</script>

<form class="flex items-center gap-2" onsubmit={submit}>
	<Input
		type="text"
		inputmode="decimal"
		autocomplete="off"
		aria-label={label}
		aria-invalid={invalid}
		placeholder={label}
		bind:value={text}
		class="h-14 flex-1 text-xl"
	/>
	<Button type="submit" size="lg" class="h-14 px-5 text-lg">{t(language, 'clarify.ok')}</Button>
</form>
