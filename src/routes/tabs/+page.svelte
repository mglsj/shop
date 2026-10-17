<script lang="ts">
	import { enhance } from '$app/forms';
	import { t, type MessageKey } from '#lib/i18n.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card } from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import type { PageData, PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Customer = PageData['customers'][number];

	const lang = $derived(data.language);

	let query = $state('');
	let adding = $state(false);
	let payingId = $state<string | null>(null);

	// Failed action results carry the action name, the customer id (if any) and an error code.
	const failure = $derived(form as { action?: string; customerId?: string; error?: string } | null);

	const shown = $derived(
		data.customers.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
	);

	function money(n: number) {
		return `₹${n.toLocaleString('en-IN')}`;
	}
	function dateText(secs: number | null) {
		if (secs === null) return t(lang, 'tabs.noActivity');
		return new Date(secs * 1000).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
	}
	function payError(customerId: string): MessageKey | null {
		if (!failure || failure.action !== 'pay' || failure.customerId !== customerId) return null;
		if (failure.error === 'amount') return 'tabs.payInvalid';
		if (failure.error === 'notFound') return 'tabs.notFound';
		return 'tabs.payFailed';
	}
	function addError(): MessageKey | null {
		if (!failure || failure.action !== 'addCustomer' || !failure.error) return null;
		if (failure.error === 'name') return 'tabs.nameRequired';
		if (failure.error === 'phone') return 'tabs.phoneInvalid';
		if (failure.error === 'duplicate') return 'tabs.duplicateCustomer';
		return 'tabs.customerFailed';
	}
</script>

<main class="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-4">
	<header class="flex items-center justify-between gap-3">
		<a href="/" class="inline-flex h-12 items-center rounded-md px-3 text-lg font-medium underline">
			{t(lang, 'tabs.back')}
		</a>
		<h1 class="text-2xl font-bold">{t(lang, 'tabs.title')}</h1>
	</header>

	<Card class="gap-1 border-2 p-5">
		<p class="text-lg text-muted-foreground">{t(lang, 'tabs.totalDue')}</p>
		<p class="text-4xl font-bold text-red-600 dark:text-red-400" data-testid="total-due">
			{money(data.totalDue)}
		</p>
	</Card>

	<div class="flex flex-col gap-2">
		<Label for="tabs-search" class="text-base">{t(lang, 'tabs.search')}</Label>
		<Input
			id="tabs-search"
			type="search"
			placeholder={t(lang, 'tabs.searchPlaceholder')}
			bind:value={query}
			class="h-14 text-lg"
		/>
	</div>

	{#if adding}
		<Card class="gap-4 border-2 p-4">
			<form
				method="POST"
				action="?/addCustomer"
				class="flex flex-col gap-4"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'success') adding = false;
						await update();
					};
				}}
			>
				<div class="flex flex-col gap-2">
					<Label for="add-name" class="text-lg">{t(lang, 'tabs.name')}</Label>
					<Input id="add-name" name="name" required maxlength={100} class="h-14 text-lg" />
				</div>
				<div class="flex flex-col gap-2">
					<Label for="add-phone" class="text-base">{t(lang, 'tabs.phone')}</Label>
					<Input id="add-phone" name="phone" type="tel" inputmode="tel" maxlength={20} class="h-14 text-lg" />
				</div>
				{#if addError()}
					<p role="alert" class="text-base font-medium text-destructive">{t(lang, addError()!)}</p>
				{/if}
				<div class="grid grid-cols-2 gap-3">
					<Button type="button" variant="outline" size="lg" class="h-14 text-lg" onclick={() => (adding = false)}>
						{t(lang, 'tabs.cancel')}
					</Button>
					<Button type="submit" size="lg" class="h-14 text-lg">{t(lang, 'tabs.save')}</Button>
				</div>
			</form>
		</Card>
	{:else}
		<Button size="lg" class="h-16 text-xl" onclick={() => (adding = true)}>
			+ {t(lang, 'tabs.addCustomer')}
		</Button>
	{/if}

	{#if data.customers.length === 0}
		<p class="py-10 text-center text-xl text-muted-foreground">{t(lang, 'tabs.empty')}</p>
	{:else if shown.length === 0}
		<p class="py-6 text-center text-xl text-muted-foreground">{t(lang, 'tabs.noMatch')}</p>
	{/if}

	{#each shown as c (c.id)}
		<Card class="gap-3 border-2 p-4">
			<div class="flex items-start justify-between gap-3">
				<div class="flex min-w-0 flex-col gap-1">
					<h2 class="truncate text-xl font-bold">{c.name}</h2>
					<p class="text-base text-muted-foreground">
						{t(lang, 'tabs.lastActivity')}: {dateText(c.lastActivity)}
					</p>
				</div>
				<div class="shrink-0 text-right">
					{#if c.due > 0}
						<p class="text-2xl font-bold text-red-600 dark:text-red-400">{money(c.due)}</p>
					{:else}
						<p class="text-lg font-semibold text-green-600 dark:text-green-400">{t(lang, 'tabs.settled')}</p>
					{/if}
				</div>
			</div>

			{#if payingId === c.id}
				<form
					method="POST"
					action="?/pay"
					class="flex flex-col gap-3"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') payingId = null;
							await update({ reset: false });
						};
					}}
				>
					<input type="hidden" name="customerId" value={c.id} />
					<Label for="pay-{c.id}" class="text-base">{t(lang, 'tabs.amount')}</Label>
					<Input
						id="pay-{c.id}"
						name="amount"
						type="number"
						inputmode="decimal"
						step="any"
						min="0"
						value={Math.max(c.due, 0)}
						class="h-14 text-lg"
					/>
					{#if payError(c.id)}
						<p role="alert" class="text-base font-medium text-destructive">{t(lang, payError(c.id)!)}</p>
					{/if}
					<div class="grid grid-cols-2 gap-3">
						<Button type="button" variant="outline" size="lg" class="h-14 text-lg" onclick={() => (payingId = null)}>
							{t(lang, 'tabs.cancel')}
						</Button>
						<Button type="submit" size="lg" class="h-14 text-lg">{t(lang, 'tabs.recordPayment')}</Button>
					</div>
				</form>
			{:else}
				{#if payError(c.id)}
					<p role="alert" class="text-base font-medium text-destructive">{t(lang, payError(c.id)!)}</p>
				{/if}
				<div class="grid grid-cols-2 gap-3">
					<Button
						size="lg"
						class="h-14 text-lg"
						disabled={c.due <= 0}
						onclick={() => (payingId = c.id)}
					>
						{t(lang, 'tabs.paid')}
					</Button>
					<a
						href="/customers/{c.id}"
						class="inline-flex h-14 items-center justify-center rounded-md border-2 px-4 text-lg font-medium"
					>
						{t(lang, 'tabs.openLedger')}
					</a>
				</div>
			{/if}
		</Card>
	{/each}
</main>
