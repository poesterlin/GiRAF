<script lang="ts">
	import Scroller from '$lib/ui/Scroller.svelte';
	import type { ExporterSessionsResponse } from '../api/exporter/sessions/+server';

	type Session = ExporterSessionsResponse['sessions'][number];
	interface Props {
		sessions: ExporterSessionsResponse['sessions'];
		next: number | null;
		onLoaded: (data: ExporterSessionsResponse) => void;
	}

	let { sessions, next, onLoaded }: Props = $props();

	let scroller = $state<Scroller<Session>>();
	let loading = $state(false);

	function formatDate(dateString: string) {
		if (!dateString) return '';
		return new Date(dateString).toLocaleDateString(undefined, {
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

{#snippet item({ item }: { item: Session })}
	<li class="p-4 flex flex-wrap justify-between items-center gap-4">
		<div>
			<h2 class="text-lg font-semibold text-neutral-200">{item.name}</h2>
			<p class="text-sm text-neutral-400">
				{item.images.length} images • {formatDate(item.startedAt)}
			</p>
		</div>
		<div class="flex items-center gap-4">
			{#if item.status === 'Updated'}
				<span class="inline-flex items-center text-xs font-medium text-yellow-300 bg-yellow-900/50 px-2.5 py-1 rounded-full">
					<span class="w-2 h-2 me-2 bg-yellow-300 rounded-full"></span>
					Updated
				</span>
				<button class="px-4 py-2 bg-neutral-50 text-neutral-950 font-semibold rounded-md hover:bg-neutral-200 transition-colors text-sm shadow-sm">
					Export
				</button>
			{:else}
				<span class="inline-flex items-center text-xs font-medium text-neutral-400 bg-neutral-800 px-2.5 py-1 rounded-full">
					<span class="w-2 h-2 me-2 bg-neutral-500 rounded-full"></span>
					Exported
				</span>
				<button class="px-4 py-2 bg-neutral-800 text-neutral-300 font-semibold rounded-md hover:bg-neutral-700 transition-colors text-sm border border-transparent hover:border-neutral-700">
					Re-export
				</button>
			{/if}
		</div>
	</li>
{/snippet}

{#snippet empty()}
	<div class="flex flex-col items-center justify-center p-8 text-center h-full">
		<svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20 mb-6 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3v11.25" />
		</svg>
		<h2 class="mb-2 text-2xl font-bold text-neutral-200">Nothing to Export</h2>
		<p class="max-w-md text-neutral-400">
			There are no sessions ready for export. Once you make edits in the gallery, they will appear here.
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

<div class="bg-neutral-900 rounded-lg border border-neutral-800">
    <Scroller
        bind:this={scroller}
        items={sessions}
        {item}
        {empty}
        {footer}
        onMore={async () => {
            if (loading || !next) return;
            loading = true;

            const response = await fetch(`/api/exporter/sessions?cursor=${next}`);
            const result = await response.json() as ExporterSessionsResponse;

            onLoaded(result);

            loading = false;
        }}
    ></Scroller>
</div>
