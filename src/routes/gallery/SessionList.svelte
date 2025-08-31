<script lang="ts">
	import Scroller from '$lib/ui/Scroller.svelte';
	import type { SessionsResponse } from '../api/sessions/+server';

	type Session = SessionsResponse["sessions"][number];
	interface Props {
		sessions: SessionsResponse["sessions"];
		next: number | null;
		onLoaded: (data: SessionsResponse) => void;
	}

	let { sessions, next, onLoaded }: Props = $props();

	export function capture() {
		return scroller?.capture();
	}

	export function restore(values: any) {
		scroller?.restore(values);
	}

	let scroller = $state<Scroller<Session>>();
	let loading = $state(false);
</script>

{#snippet item({ item }: { item: Session })}
	<section>
		<div class="mb-4 flex items-baseline justify-between">
			<h2 class="text-xl font-semibold text-neutral-200 sm:text-2xl">{item.name}</h2>
			<p class="ml-4 flex-shrink-0 text-neutral-400">{item.startedAt}</p>
		</div>
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{#each item.images as preview, i}
				<a href={`/${item.images[i]}`} class="group block aspect-[3/2] overflow-hidden rounded-lg bg-neutral-900 ring-1 ring-transparent transition hover:ring-neutral-700">
					<img src="/api/images/{preview.id}" alt="" loading="lazy" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
				</a>
			{/each}
		</div>
	</section>
{/snippet}

{#snippet empty()}
    <div class="flex flex-col items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center h-full">
		<svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20 mb-6 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.158 0a.075.075 0 0 1 .075-.075h.009a.075.075 0 0 1 .075.075v.009a.075.075 0 0 1-.075.075h-.009a.075.075 0 0 1-.075-.075V8.25Z" />
		</svg>
		<h2 class="mb-2 text-2xl font-bold text-neutral-200">Your Gallery is Empty</h2>
		<p class="max-w-md text-neutral-400">
			It looks like you haven't created any sessions yet. Start a new editing session to see your photos here.
		</p>
	</div>
{/snippet}

{#snippet footer()}
	{#if loading}
		<div class="flex justify-center p-4">
			<p class="text-neutral-400">Loading more...</p>
		</div>
	{/if}
{/snippet}

<Scroller
	bind:this={scroller}
	items={sessions}
	{item}
	{empty}
	{footer}
	onMore={async () => {
		if (loading || !next) return;
		loading = true;

		const response = await fetch(`/api/sessions?offset=${next}`);
		const result = await response.json() as SessionsResponse;

		onLoaded(result);

		loading = false;
	}}
></Scroller>

