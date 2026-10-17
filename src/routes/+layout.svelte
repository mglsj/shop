<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { House, Package, Users } from '@lucide/svelte';
	import { t, type MessageKey } from '#lib/i18n.js';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const links = [
		{ href: '/', label: 'nav.home', icon: House },
		{ href: '/tabs', label: 'nav.tabs', icon: Users },
		{ href: '/inventory', label: 'nav.inventory', icon: Package },
	] as const satisfies readonly { href: string; label: MessageKey; icon: unknown }[];

	const active = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class={data.shop ? 'pb-24' : ''}>
	{@render children()}
</div>

{#if data.shop}
	{@const lang = data.shop.language}
	<nav
		class="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur"
		aria-label="Main"
	>
		<ul class="mx-auto flex max-w-md">
			{#each links as link (link.href)}
				<li class="flex-1">
					<a
						href={link.href}
						aria-current={active(link.href) ? 'page' : undefined}
						class="flex min-h-16 flex-col items-center justify-center gap-1 text-sm font-medium {active(
							link.href
						)
							? 'text-primary'
							: 'text-muted-foreground'}"
					>
						<link.icon class="size-6" />
						{t(lang, link.label)}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}
