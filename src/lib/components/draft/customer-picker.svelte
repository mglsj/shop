<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { t } from '#lib/i18n.js';
	import type { Language } from '#lib/languages.js';
	import type { CustomerBalance } from '#lib/ledger-types.js';

	let {
		language,
		onpick,
		onadd
	}: {
		language: Language;
		onpick: (customer: { id: string; name: string }) => void;
		onadd: (name: string) => void;
	} = $props();

	let customers = $state<CustomerBalance[]>([]);
	let loadFailed = $state(false);
	let name = $state('');

	$effect(() => {
		let cancelled = false;
		fetch('/api/customers')
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
			.then((list: CustomerBalance[]) => {
				if (!cancelled) customers = list;
			})
			.catch(() => {
				if (!cancelled) loadFailed = true;
			});
		return () => {
			cancelled = true;
		};
	});

	function add(e: SubmitEvent) {
		e.preventDefault();
		const trimmed = name.trim();
		if (trimmed) onadd(trimmed);
	}
</script>

<div class="flex flex-col gap-3">
	{#if loadFailed}
		<p role="alert" class="text-destructive">{t(language, 'clarify.error.customers')}</p>
	{:else if customers.length}
		<p class="font-medium">{t(language, 'clarify.pickCustomer')}</p>
		<div class="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
			{#each customers as c (c.id)}
				<Button
					type="button"
					variant="outline"
					class="h-14 text-lg"
					onclick={() => onpick({ id: c.id, name: c.name })}
				>
					{c.name}
				</Button>
			{/each}
		</div>
	{/if}

	<form class="flex items-center gap-2" onsubmit={add}>
		<Input
			type="text"
			autocomplete="off"
			aria-label={t(language, 'clarify.typeName')}
			placeholder={t(language, 'clarify.typeName')}
			bind:value={name}
			class="h-14 flex-1 text-xl"
		/>
		<Button type="submit" size="lg" class="h-14 px-5 text-lg" disabled={!name.trim()}>
			{t(language, 'clarify.add')}
		</Button>
	</form>
</div>
