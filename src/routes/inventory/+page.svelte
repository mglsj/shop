<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '#lib/i18n.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card } from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import type { PageData, PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Product = PageData['products'][number];
	type Fields = { name: string; unit: string | null; defaultPrice: number | null; stockQty: number | null };

	const lang = $derived(data.language);
	const LOW_STOCK = 5;

	let adding = $state(false);
	let editingId = $state<string | null>(null);

	// Failed action results carry the action name, the product id (if any) and an error key.
	const failure = $derived(form as { action?: string; id?: string; error?: string } | null);

	function isLow(p: Product) {
		return p.stockQty !== null && p.stockQty <= LOW_STOCK;
	}
	function money(n: number | null) {
		return n === null ? null : `₹${n.toLocaleString('en-IN')}`;
	}
	function stockText(p: Product) {
		return p.stockQty === null ? t(lang, 'inventory.noStock') : `${p.stockQty} ${p.unit ?? ''}`.trim();
	}
	function errorFor(action: string, id?: string) {
		if (!failure || failure.action !== action || failure.error === undefined) return null;
		if (id !== undefined && failure.id !== id) return null;
		return failure.error === 'in_use' ? t(lang, 'inventory.inUse') : t(lang, 'inventory.invalid');
	}
</script>

{#snippet productFields(v: Partial<Fields>, prefix: string)}
	<div class="flex flex-col gap-2">
		<Label for="{prefix}-name" class="text-lg">{t(lang, 'inventory.name')}</Label>
		<Input id="{prefix}-name" name="name" required maxlength={100} value={v.name ?? ''} class="h-14 text-lg" />
	</div>
	<div class="grid grid-cols-2 gap-3">
		<div class="flex flex-col gap-2">
			<Label for="{prefix}-unit" class="text-base">{t(lang, 'inventory.unit')}</Label>
			<Input id="{prefix}-unit" name="unit" maxlength={20} value={v.unit ?? ''} class="h-14 text-lg" />
		</div>
		<div class="flex flex-col gap-2">
			<Label for="{prefix}-price" class="text-base">{t(lang, 'inventory.price')}</Label>
			<Input
				id="{prefix}-price"
				name="defaultPrice"
				type="number"
				inputmode="decimal"
				step="any"
				min="0"
				value={v.defaultPrice ?? ''}
				class="h-14 text-lg"
			/>
		</div>
	</div>
	<div class="flex flex-col gap-2">
		<Label for="{prefix}-stock" class="text-base">{t(lang, 'inventory.stock')}</Label>
		<Input
			id="{prefix}-stock"
			name="stockQty"
			type="number"
			inputmode="decimal"
			step="any"
			min="0"
			value={v.stockQty ?? ''}
			class="h-14 text-lg"
		/>
	</div>
{/snippet}

<main class="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-4">
	<header class="flex items-center justify-between gap-3">
		<a href="/" class="inline-flex h-12 items-center rounded-md px-3 text-lg font-medium underline">
			{t(lang, 'inventory.back')}
		</a>
		<h1 class="text-2xl font-bold">{t(lang, 'inventory.title')}</h1>
	</header>

	{#if adding}
		<Card class="gap-4 border-2 p-4">
			<form
				method="POST"
				action="?/create"
				class="flex flex-col gap-4"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'success') adding = false;
						await update();
					};
				}}
			>
				{@render productFields({}, 'add')}
				{#if errorFor('create')}
					<p role="alert" class="text-base font-medium text-destructive">{errorFor('create')}</p>
				{/if}
				<div class="grid grid-cols-2 gap-3">
					<Button type="button" variant="outline" size="lg" class="h-14 text-lg" onclick={() => (adding = false)}>
						{t(lang, 'inventory.cancel')}
					</Button>
					<Button type="submit" size="lg" class="h-14 text-lg">{t(lang, 'inventory.save')}</Button>
				</div>
			</form>
		</Card>
	{:else}
		<Button size="lg" class="h-16 text-xl" onclick={() => (adding = true)}>
			+ {t(lang, 'inventory.add')}
		</Button>
	{/if}

	{#if data.products.length === 0}
		<p class="py-10 text-center text-xl text-muted-foreground">{t(lang, 'inventory.empty')}</p>
	{/if}

	{#each data.products as p (p.id)}
		<Card
			class="gap-3 border-2 p-4 {isLow(p) ? 'border-amber-500 bg-amber-50 dark:bg-amber-950' : ''}"
		>
			{#if editingId === p.id}
				<form
					method="POST"
					action="?/update"
					class="flex flex-col gap-4"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') editingId = null;
							await update({ reset: false });
						};
					}}
				>
					<input type="hidden" name="id" value={p.id} />
					{@render productFields(p, p.id)}
					{#if errorFor('update', p.id)}
						<p role="alert" class="text-base font-medium text-destructive">{errorFor('update', p.id)}</p>
					{/if}
					<div class="grid grid-cols-2 gap-3">
						<Button type="button" variant="outline" size="lg" class="h-14 text-lg" onclick={() => (editingId = null)}>
							{t(lang, 'inventory.cancel')}
						</Button>
						<Button type="submit" size="lg" class="h-14 text-lg">{t(lang, 'inventory.save')}</Button>
					</div>
				</form>
			{:else}
				<div class="flex flex-col gap-1">
					<div class="flex items-start justify-between gap-2">
						<h2 class="text-xl font-bold">{p.name}</h2>
						{#if isLow(p)}
							<span class="rounded-md bg-amber-500 px-2 py-1 text-sm font-semibold text-white">
								{t(lang, 'inventory.lowStock')}
							</span>
						{/if}
					</div>
					<dl class="grid grid-cols-3 gap-2 text-lg">
						<div>
							<dt class="text-sm text-muted-foreground">{t(lang, 'inventory.unit')}</dt>
							<dd class="font-medium">{p.unit ?? '—'}</dd>
						</div>
						<div>
							<dt class="text-sm text-muted-foreground">{t(lang, 'inventory.price')}</dt>
							<dd class="font-medium">{money(p.defaultPrice) ?? t(lang, 'inventory.noPrice')}</dd>
						</div>
						<div>
							<dt class="text-sm text-muted-foreground">{t(lang, 'inventory.stock')}</dt>
							<dd class="font-medium">{stockText(p)}</dd>
						</div>
					</dl>
				</div>

				{#if errorFor('delete', p.id)}
					<p role="alert" class="text-base font-medium text-destructive">{errorFor('delete', p.id)}</p>
				{/if}

				<div class="grid grid-cols-2 gap-3">
					<Button variant="outline" size="lg" class="h-14 text-lg" onclick={() => (editingId = p.id)}>
						{t(lang, 'inventory.edit')}
					</Button>
					<form
						method="POST"
						action="?/delete"
						onsubmit={(e) => {
							if (!confirm(t(lang, 'inventory.confirmDelete'))) e.preventDefault();
						}}
					>
						<input type="hidden" name="id" value={p.id} />
						<Button type="submit" variant="destructive" size="lg" class="h-14 w-full text-lg">
							{t(lang, 'inventory.delete')}
						</Button>
					</form>
				</div>
			{/if}
		</Card>
	{/each}
</main>
