<script lang="ts">
	import { enhance } from '$app/forms';
	import { LANGUAGES, type Language } from '#lib/languages.js';
	import { LANGUAGE_LABELS, t } from '#lib/i18n.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import type { PageProps } from './$types';

	let { form, data }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	let language = $state<Language>(data.shop?.language ?? 'hi-IN');
	// svelte-ignore state_referenced_locally
	let name = $state(form?.name ?? data.shop?.name ?? '');
</script>

<main class="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 p-4">
	<h1 class="text-3xl font-bold">{t(language, 'onboarding.welcome')}</h1>

	<form method="POST" use:enhance class="flex flex-col gap-6">
		<fieldset class="flex flex-col gap-3">
			<legend class="mb-3 text-lg font-medium">{t(language, 'onboarding.language')}</legend>
			{#each LANGUAGES as code (code)}
				<label
					class="flex min-h-16 cursor-pointer items-center justify-center rounded-xl border-2 px-4 text-2xl font-semibold transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
				>
					<input type="radio" name="language" value={code} bind:group={language} class="sr-only" />
					{LANGUAGE_LABELS[code].native}
				</label>
			{/each}
		</fieldset>

		<div class="flex flex-col gap-2">
			<Label for="name" class="text-lg">{t(language, 'onboarding.shopName')}</Label>
			<Input
				id="name"
				name="name"
				bind:value={name}
				required
				autocomplete="organization"
				placeholder={t(language, 'onboarding.shopNamePlaceholder')}
				class="h-12 text-lg"
			/>
		</div>

		<Button type="submit" size="lg" class="h-14 text-lg">{t(language, 'onboarding.start')}</Button>
	</form>
</main>
