<script lang="ts">
	import { untrack } from 'svelte';
	import { Mic } from '@lucide/svelte';
	import type { Language } from '#lib/languages.js';
	import { t } from '#lib/i18n.js';
	import { format, rupees } from '#lib/format.js';
	import { speak } from '#lib/speak.js';
	import { resolveEntity } from '#lib/name-match.js';
	import type { CustomerBalance } from '#lib/ledger-types.js';
	import type { Committed, Draft, DraftIssue, Match, VoiceAnswer } from '#lib/voice-types.js';
	import {
		blockingIssues,
		buildCommitInput,
		nextIssue,
		setAmount,
		setCustomer,
		setItemPrice,
		setMatchedCustomer,
		setPaymentMode
	} from '#lib/voice-draft.js';
	import { composeDuesAnswer } from '#lib/voice-answer.js';
	import { parseCandidate, parseNumber, parsePaymentMode, parseYesNo } from '#lib/voice-reply.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import NumberField from '#lib/components/draft/number-field.svelte';
	import CustomerPicker from '#lib/components/draft/customer-picker.svelte';

	let {
		draft = $bindable(),
		answer = $bindable(null),
		language,
		ondismiss,
		oncommitted
	}: {
		draft: Draft;
		answer?: VoiceAnswer | null;
		language: Language;
		ondismiss: () => void;
		oncommitted: (result: Committed) => void;
	} = $props();

	let busy = $state(false);
	let error = $state<string | null>(null);

	const issue = $derived(nextIssue(draft));
	const blocked = $derived(blockingIssues(draft).length > 0);
	const spokenName = $derived(draft.customer?.spoken ?? '');
	const unpricedSale = $derived(draft.intent === 'sale' && draft.items.some((i) => i.unitPrice == null));

	function questionFor(which: DraftIssue | null): string | null {
		switch (which) {
			case 'payment_mode':
				return t(language, 'clarify.q.payment_mode');
			case 'customer_new':
				return format(t(language, 'clarify.q.customer_new'), { name: spokenName });
			case 'customer_ambiguous':
				return format(t(language, 'clarify.q.customer_ambiguous'), {
					names: (draft.customer?.candidates ?? []).map((c) => c.name).join(', ')
				});
			case 'customer_required':
				return t(language, 'clarify.q.customer_required');
			case 'amount_missing':
				return t(language, unpricedSale ? 'clarify.q.amount_missing.items' : 'clarify.q.amount_missing');
			default:
				return null;
		}
	}

	const question = $derived(questionFor(issue));
	/** A query about someone we do not know has no question, just "not found". */
	const notFound = $derived(
		draft.intent === 'query' && draft.customer?.status === 'new'
			? format(t(language, 'clarify.q.notFound'), { name: spokenName })
			: null
	);

	// Speak each new question once, when it changes (the page re-creates this card per draft).
	$effect(() => {
		const text = question ?? notFound;
		if (text) void speak(text);
	});

	// A query whose customer was just resolved here still needs its answer from the ledger.
	$effect(() => {
		if (draft.intent !== 'query' || answer || blockingIssues(draft).length) return;
		if (draft.customer && draft.customer.status !== 'matched') return;
		const id = draft.customer?.match?.id;
		const name = draft.customer?.match?.name ?? null;
		untrack(() => void loadDues(id, name));
	});

	async function loadDues(customerId: string | undefined, customerName: string | null) {
		try {
			const res = await fetch(customerId ? `/api/dues?customerId=${encodeURIComponent(customerId)}` : '/api/dues');
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error?.message);
			const text = composeDuesAnswer(language, { customerName, ...data });
			answer = { text, total: data.total, customers: data.customers };
			void speak(text);
		} catch {
			error = t(language, 'voice.error.generic');
		}
	}

	async function post(url: string, body: unknown) {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = await res.json().catch(() => null);
		return { ok: res.ok, data };
	}

	// ---- actions (buttons and voice answers share these) ----

	function chooseMode(mode: 'cash' | 'tab') {
		error = null;
		draft = setPaymentMode(draft, mode);
	}

	/** Creates the spoken name (or a typed one) as a new customer and uses it. */
	async function addCustomer(name: string) {
		error = null;
		busy = true;
		try {
			const { ok, data } = await post('/api/customers', { name });
			if (ok && data?.customer) draft = setMatchedCustomer(draft, data.customer);
			else error = data?.error?.message ?? t(language, 'voice.error.generic');
		} catch {
			error = t(language, 'voice.error.generic');
		} finally {
			busy = false;
		}
	}

	/** Picks an existing candidate and teaches the app the spoken spelling as an alias. */
	async function chooseCandidate(match: Match) {
		error = null;
		const spoken = draft.customer?.spoken;
		draft = setMatchedCustomer(draft, match);
		if (spoken) {
			try {
				await post('/api/customers', { name: spoken, aliasOf: match.id });
			} catch {
				// learning the alias is best effort
			}
		}
	}

	/** "No" to adding a new customer: drop it. Tab sales and payments then ask for a customer again. */
	function declineNew() {
		error = null;
		draft = setCustomer(draft, null);
	}

	function priceItem(index: number, price: number) {
		draft = setItemPrice(draft, index, price);
	}

	async function confirm() {
		const input = buildCommitInput(draft);
		if (!input) return;
		error = null;
		busy = true;
		try {
			const { ok, data } = await post('/api/commit', input);
			if (!ok) {
				error = data?.error?.message ?? t(language, 'clarify.error.commit');
				return;
			}
			const name = draft.customer?.match?.name;
			const due: number | null = data.customerDue ?? null;
			let message = '';
			let spoken = t(language, 'clarify.spoken.saved');
			if (name && due != null) {
				const vars = { name, amount: rupees(due) };
				message = format(t(language, due > 0 ? 'clarify.nowOwes' : 'clarify.noDue'), vars);
				spoken = format(t(language, due > 0 ? 'clarify.spoken.savedDue' : 'clarify.spoken.savedClear'), vars);
			}
			oncommitted({ txnId: data.txnId, message, spoken });
		} catch {
			error = t(language, 'clarify.error.commit');
		} finally {
			busy = false;
		}
	}

	/**
	 * Applies a spoken answer to the CURRENT question only. Unrecognised answers re-ask.
	 * Called by the page when a recording made in "answer" mode has been transcribed.
	 */
	export async function answerBy(transcript: string): Promise<void> {
		const current = issue;
		let handled = false;

		if (current === 'payment_mode') {
			const mode = parsePaymentMode(transcript);
			if (mode) {
				chooseMode(mode);
				handled = true;
			}
		} else if (current === 'customer_new') {
			const yn = parseYesNo(transcript);
			if (yn === 'yes') {
				await addCustomer(spokenName);
				handled = true;
			} else if (yn === 'no') {
				declineNew();
				handled = true;
			}
		} else if (current === 'customer_ambiguous') {
			const pick = parseCandidate(transcript, draft.customer?.candidates ?? []);
			if (pick?.kind === 'candidate') {
				await chooseCandidate(pick.match);
				handled = true;
			} else if (pick?.kind === 'new') {
				await addCustomer(spokenName);
				handled = true;
			}
		} else if (current === 'customer_required') {
			const name = transcript.replace(/[.,!?।]+$/u, '').trim();
			if (name) {
				try {
					const res = await fetch('/api/customers');
					const list: CustomerBalance[] = res.ok ? await res.json() : [];
					draft = setCustomer(draft, resolveEntity(name, list));
					handled = true;
				} catch {
					handled = false;
				}
			}
		} else if (current === 'amount_missing') {
			const n = parseNumber(transcript);
			if (n != null && n > 0) {
				draft = setAmount(draft, n);
				handled = true;
			}
		}

		if (!handled && question) void speak(`${t(language, 'clarify.retry')} ${question}`);
	}

	const title = $derived(
		(
			{
				sale: 'draft.sale',
				payment: 'draft.payment',
				query: 'draft.query',
				clarify: 'draft.clarify',
				unknown: 'draft.unknown'
			} as const
		)[draft.intent]
	);
	const modeLabel = $derived(
		draft.paymentMode === 'cash'
			? t(language, 'draft.cash')
			: draft.paymentMode === 'tab'
				? t(language, 'draft.tab')
				: t(language, 'draft.mode.unknown')
	);
	const canCommit = $derived(draft.intent === 'sale' || draft.intent === 'payment');
</script>

{#snippet askBar(text: string)}
	<div class="flex items-start gap-3 rounded-xl bg-amber-100 p-4 text-amber-950" role="status">
		<Mic class="mt-1 size-6 shrink-0" />
		<div>
			<p class="text-xl font-semibold">{text}</p>
			<p class="text-sm">{t(language, 'clarify.answerHint')}</p>
		</div>
	</div>
{/snippet}

<Card.Root class="w-full">
	<Card.Header>
		<Card.Title class="text-xl">{t(language, title)}</Card.Title>
		<Card.Description>{t(language, 'draft.heard')}: “{draft.transcript}”</Card.Description>
	</Card.Header>

	<Card.Content class="flex flex-col gap-4">
		{#if draft.question}
			<p class="text-lg">{draft.question}</p>
		{/if}

		{#if draft.intent === 'sale' || draft.intent === 'payment' || draft.intent === 'query'}
			<div class="flex justify-between gap-2 text-lg">
				<span class="text-muted-foreground">{t(language, 'draft.customer')}</span>
				<span class="font-semibold">
					{#if draft.customer?.match}
						{draft.customer.match.name}
					{:else if draft.customer}
						{draft.customer.spoken}
					{:else}
						{t(language, 'draft.noCustomer')}
					{/if}
				</span>
			</div>
		{/if}

		{#if draft.items.length}
			<ul class="flex flex-col gap-3 border-y py-3">
				{#each draft.items as item, i (`${i}:${item.spoken}`)}
					<li class="flex flex-col gap-2">
						<div class="flex justify-between gap-2 text-lg">
							<span>
								{item.product.match?.name ?? item.spoken} × {item.qty}{item.unit ? ` ${item.unit}` : ''}
								{#if item.product.status === 'new'}
									<span class="rounded bg-muted px-1.5 text-sm">{t(language, 'clarify.newItem')}</span>
								{/if}
							</span>
							<span class="tabular-nums">
								{item.unitPrice != null ? rupees(item.qty * item.unitPrice) : '—'}
							</span>
						</div>
						{#if item.unitPrice == null || item.product.status === 'new'}
							<NumberField
								label={`${t(language, 'clarify.price')}`}
								{language}
								value={item.unitPrice}
								onsubmit={(n) => priceItem(i, n)}
							/>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if draft.intent === 'sale' || draft.intent === 'payment'}
			<div class="flex justify-between gap-2 text-2xl font-bold">
				<span>{t(language, 'draft.total')}</span>
				<span class="tabular-nums">{draft.amount != null ? rupees(draft.amount) : '—'}</span>
			</div>
		{/if}

		{#if draft.intent === 'sale' && draft.paymentMode !== 'unknown'}
			<p class="text-lg font-medium">{modeLabel}</p>
		{/if}

		<!-- the current question and its big-button answers -->
		{#if issue && question}
			{@render askBar(question)}

			{#if issue === 'payment_mode'}
				<div class="grid grid-cols-2 gap-3">
					<Button type="button" class="h-auto min-h-20 whitespace-normal py-3 text-xl" onclick={() => chooseMode('cash')}>
						{t(language, 'clarify.cash')}
					</Button>
					<Button type="button" variant="secondary" class="h-auto min-h-20 whitespace-normal py-3 text-xl" onclick={() => chooseMode('tab')}>
						{t(language, 'clarify.tab')}
					</Button>
				</div>
			{:else if issue === 'customer_new'}
				<div class="grid grid-cols-2 gap-3">
					<Button type="button" class="h-20 text-xl" disabled={busy} onclick={() => addCustomer(spokenName)}>
						{t(language, 'clarify.yes')}
					</Button>
					<Button type="button" variant="outline" class="h-20 text-xl" disabled={busy} onclick={declineNew}>
						{t(language, 'clarify.no')}
					</Button>
				</div>
			{:else if issue === 'customer_ambiguous'}
				<div class="flex flex-col gap-3">
					{#each draft.customer?.candidates ?? [] as candidate (candidate.id)}
						<Button type="button" class="h-16 text-xl" onclick={() => chooseCandidate(candidate)}>
							{candidate.name}
						</Button>
					{/each}
					<Button
						type="button"
						variant="outline"
						class="h-16 text-xl"
						disabled={busy}
						onclick={() => addCustomer(spokenName)}
					>
						{t(language, 'clarify.newCustomer')}
					</Button>
				</div>
			{:else if issue === 'customer_required'}
				<CustomerPicker
					{language}
					onpick={(c) => (draft = setMatchedCustomer(draft, c))}
					onadd={(name) => addCustomer(name)}
				/>
			{:else if issue === 'amount_missing'}
				<NumberField
					label={t(language, draft.intent === 'sale' ? 'clarify.total' : 'clarify.amount')}
					{language}
					value={draft.intent === 'sale' ? (draft.statedTotal ?? null) : draft.amount}
					onsubmit={(n) => (draft = setAmount(draft, n))}
				/>
			{/if}
		{:else if notFound}
			<p class="rounded-xl bg-amber-100 p-4 text-xl font-semibold text-amber-950" role="status">{notFound}</p>
		{/if}

		{#if draft.intent === 'query' && answer}
			<div class="flex flex-col gap-2" role="status">
				<p class="text-xl font-semibold">{answer.text}</p>
				{#if answer.customers.length}
					<ul class="flex flex-col divide-y rounded-xl border">
						{#each answer.customers as c (c.id)}
							<li class="flex justify-between gap-2 p-3 text-lg">
								<span>{c.name}</span>
								<span class="font-semibold tabular-nums">{rupees(c.due)}</span>
							</li>
						{/each}
					</ul>
					<div class="flex justify-between gap-2 text-xl font-bold">
						<span>{t(language, 'clarify.dues.total')}</span>
						<span class="tabular-nums">{rupees(answer.total)}</span>
					</div>
				{:else}
					<p class="text-lg">{t(language, 'clarify.dues.nobody')}</p>
				{/if}
			</div>
		{/if}

		{#if error}
			<p role="alert" class="text-lg text-destructive">{error}</p>
		{/if}
	</Card.Content>

	<Card.Footer class="flex flex-col gap-3">
		{#if canCommit}
			<Button
				type="button"
				size="lg"
				class="h-16 w-full text-xl"
				disabled={blocked || busy}
				onclick={confirm}
			>
				{busy ? t(language, 'clarify.saving') : t(language, 'clarify.confirm')}
			</Button>
		{/if}
		<Button type="button" variant="outline" size="lg" class="h-14 w-full text-lg" onclick={ondismiss}>
			{t(language, 'draft.dismiss')}
		</Button>
	</Card.Footer>
</Card.Root>
