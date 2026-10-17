<script lang="ts">
	import { enhance } from '$app/forms';
	import { t, type MessageKey } from '#lib/i18n.js';
	import ReminderButton from '#lib/components/reminder-button.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card } from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import type { PageData, PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const lang = $derived(data.language);
	const ledger = $derived(data.ledger);

	// Failed action results carry the action name, the txn id (for undo) and an error code.
	const failure = $derived(form as { action?: string; txnId?: string; error?: string } | null);

	type Entry = PageData['ledger']['entries'][number];

	function money(n: number) {
		return `₹${n.toLocaleString('en-IN')}`;
	}
	function dateText(secs: number) {
		return new Date(secs * 1000).toLocaleDateString(lang, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
	function itemText(i: Entry['items'][number]) {
		return `${i.name} × ${i.qty}${i.unit ? ` ${i.unit}` : ''}`;
	}
	function payError(): MessageKey | null {
		if (!failure || failure.action !== 'pay' || !failure.error) return null;
		if (failure.error === 'amount') return 'tabs.payInvalid';
		if (failure.error === 'notFound') return 'tabs.notFound';
		return 'tabs.payFailed';
	}
	function undoError(txnId: string): MessageKey | null {
		if (!failure || failure.action !== 'undo' || failure.txnId !== txnId || !failure.error) return null;
		if (failure.error === 'txnNotFound') return 'tabs.txnNotFound';
		if (failure.error === 'alreadyUndone') return 'tabs.alreadyUndone';
		return 'tabs.undoFailed';
	}
</script>

<main class="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-4">
	<header class="flex flex-col gap-2">
		<a href="/tabs" class="inline-flex h-12 w-fit items-center rounded-md px-3 text-lg font-medium underline">
			← {t(lang, 'tabs.customerBack')}
		</a>
		<h1 class="text-3xl font-bold">{ledger.customer.name}</h1>
		<p class="text-lg text-muted-foreground">
			{t(lang, 'tabs.phoneLabel')}: {ledger.customer.phone ?? t(lang, 'tabs.noPhone')}
		</p>
	</header>

	<Card class="gap-1 border-2 p-5">
		<p class="text-lg text-muted-foreground">{t(lang, 'tabs.due')}</p>
		{#if ledger.due > 0}
			<p class="text-4xl font-bold text-red-600 dark:text-red-400" data-testid="customer-due">
				{money(ledger.due)}
			</p>
		{:else}
			<p class="text-3xl font-bold text-green-600 dark:text-green-400" data-testid="customer-due">
				{t(lang, 'tabs.settled')}
			</p>
		{/if}
	</Card>

	{#if ledger.due > 0}
		<ReminderButton
			customer={{ name: ledger.customer.name, phone: ledger.customer.phone, due: ledger.due }}
			language={lang}
			shopName={data.shopName}
		/>
	{/if}

	<Card class="gap-4 border-2 p-4">
		<h2 class="text-xl font-bold">{t(lang, 'tabs.addPayment')}</h2>
		<form
			method="POST"
			action="?/pay"
			class="flex flex-col gap-4"
			use:enhance={() => {
				return async ({ update }) => {
					await update();
				};
			}}
		>
			<div class="flex flex-col gap-2">
				<Label for="pay-amount" class="text-lg">{t(lang, 'tabs.amount')}</Label>
				<Input
					id="pay-amount"
					name="amount"
					type="number"
					inputmode="decimal"
					step="any"
					min="0"
					value={Math.max(ledger.due, 0) || ''}
					class="h-14 text-lg"
				/>
			</div>
			{#if payError()}
				<p role="alert" class="text-base font-medium text-destructive">{t(lang, payError()!)}</p>
			{/if}
			<Button type="submit" size="lg" class="h-14 text-lg">{t(lang, 'tabs.recordPayment')}</Button>
		</form>
	</Card>

	<section class="flex flex-col gap-3">
		<h2 class="text-xl font-bold">{t(lang, 'tabs.history')}</h2>

		{#if ledger.entries.length === 0}
			<p class="py-8 text-center text-lg text-muted-foreground">{t(lang, 'tabs.noEntries')}</p>
		{/if}

		{#each ledger.entries as e (e.id)}
			<Card class="gap-2 border-2 p-4 {e.reversed ? 'opacity-60' : ''}">
				<div class="flex items-center justify-between gap-2">
					<div class="flex flex-wrap items-center gap-2">
						<span class="text-lg font-bold {e.reversed ? 'line-through' : ''}">
							{e.kind === 'sale' ? t(lang, 'tabs.sale') : t(lang, 'tabs.payment')}
						</span>
						<span
							class="rounded-md px-2 py-1 text-sm font-semibold {e.paymentMode === 'tab'
								? 'bg-amber-500 text-white'
								: 'bg-green-600 text-white'}"
						>
							{e.paymentMode === 'tab' ? t(lang, 'tabs.modeTab') : t(lang, 'tabs.modeCash')}
						</span>
						{#if e.reversed}
							<span class="rounded-md border px-2 py-1 text-sm font-semibold">{t(lang, 'tabs.undone')}</span>
						{/if}
					</div>
					<p class="shrink-0 text-lg font-bold {e.reversed ? 'line-through' : ''}">{money(e.amount)}</p>
				</div>

				<p class="text-base text-muted-foreground {e.reversed ? 'line-through' : ''}">{dateText(e.createdAt)}</p>

				{#if e.items.length > 0}
					<ul class="flex flex-col gap-1 text-base {e.reversed ? 'line-through' : ''}">
						{#each e.items as item, i (i)}
							<li class="flex justify-between gap-2">
								<span>{itemText(item)}</span>
								<span>{money(item.lineTotal)}</span>
							</li>
						{/each}
					</ul>
				{/if}

				{#if !e.reversed}
					{#if undoError(e.id)}
						<p role="alert" class="text-base font-medium text-destructive">{t(lang, undoError(e.id)!)}</p>
					{/if}
					<form
						method="POST"
						action="?/undo"
						use:enhance={({ cancel }) => {
							if (!confirm(t(lang, 'tabs.confirmUndo'))) cancel();
							return async ({ update }) => {
								await update();
							};
						}}
					>
						<input type="hidden" name="txnId" value={e.id} />
						<Button type="submit" variant="outline" size="lg" class="h-14 w-full text-lg">
							{t(lang, 'tabs.undo')}
						</Button>
					</form>
				{/if}
			</Card>
		{/each}
	</section>
</main>
