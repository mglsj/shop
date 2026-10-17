<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { t } from '#lib/i18n.js';
	import type { Language } from '#lib/languages.js';
	import { buildReminderMessage, whatsappUrl } from '#lib/reminder.js';
	import { MessageCircle } from '@lucide/svelte';

	let {
		customer,
		language,
		shopName
	}: {
		customer: { name: string; phone: string | null; due: number };
		language: Language;
		shopName: string;
	} = $props();

	const href = $derived(
		whatsappUrl(
			customer.phone,
			buildReminderMessage(language, {
				customerName: customer.name,
				due: customer.due,
				shopName
			})
		)
	);
</script>

<div class="flex w-full flex-col gap-1.5">
	<Button
		{href}
		target="_blank"
		rel="noopener noreferrer"
		class="h-12 w-full gap-2 bg-[#25D366] text-base font-semibold text-white hover:bg-[#1ebe5a]"
	>
		<MessageCircle class="size-5" />
		{t(language, 'reminder.send')}
	</Button>
	{#if !customer.phone}
		<p class="text-center text-xs text-muted-foreground">{t(language, 'reminder.noPhone')}</p>
	{/if}
</div>
