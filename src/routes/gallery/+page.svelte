<script lang="ts">
	import SessionList from '$lib/ui/SessionList.svelte';
	import ContactSheet, { photoThumbnail } from '$lib/ui/ContactSheet.svelte';
	import ArchivedSessions from '$lib/ui/ArchivedSessions.svelte';
	import { IconArchive } from '$lib/ui/icons';

	let { data } = $props();

	let basePath = $derived(data.triageEnabled ? 'triage' as const : 'editor' as const);
	const view = $derived(data.view);
	const viewKey = $derived(view.kind === 'tag' ? `tag:${view.tag}` : view.kind);
	const tabs = $derived([
		{ key: 'sessions', label: 'Sessions', href: '/gallery' },
		{ key: 'recent', label: 'Recent edits', href: '/gallery?view=recent' },
		...data.tags.map((tag) => ({ key: `tag:${tag.name}`, label: `#${tag.name}`, href: `/gallery?tag=${encodeURIComponent(tag.name)}`, count: tag.count })),
		// Archived sessions leave the other views; this is where they can be found and restored.
		...(data.archivedCount || view.kind === 'archived' ? [{ key: 'archived', label: 'Archive', href: '/gallery?view=archived', icon: IconArchive }] : [])
	]);
</script>

<div class="flex h-full min-h-0 flex-col">
	{#if !(view.kind === 'sessions' && view.sessionId)}
		<nav aria-label="Gallery views" class="views">
			{#each tabs as tab (tab.key)}
				<a href={tab.href} aria-current={viewKey === tab.key ? 'page' : undefined} data-sveltekit-noscroll>
					{#if 'icon' in tab && tab.icon}{@const Icon = tab.icon}<Icon size={16} aria-hidden="true" />{/if}{tab.label}{#if 'count' in tab}<span class="count">{tab.count}</span>{/if}
				</a>
			{/each}
		</nav>
	{/if}

	<div class="min-h-0 flex-1">
		{#if view.kind === 'sessions'}
			{#snippet recentStrip()}
				{#if data.photos.length}
					<section aria-label="Recent edits" class="px-4 pt-5 pb-1 sm:px-7">
						<div class="mb-2 flex items-center justify-between">
							<h2 class="text-sm font-semibold text-neutral-200">Recent edits</h2>
							<a href="/gallery?view=recent" class="flex min-h-11 items-center px-2 text-sm text-neutral-400 hover:text-white">See all</a>
						</div>
						<div class="strip">
							{#each data.photos as photo (photo.id)}
								<a href={`/editor/${photo.id}`} aria-label={`Edit photo from ${photo.sessionName}`}>
									<img src={photoThumbnail(photo)} alt="" width="300" height="200" loading="lazy" decoding="async" draggable="false" />
								</a>
							{/each}
						</div>
					</section>
				{/if}
			{/snippet}
			<SessionList
				allowRename
				editedThumbnails
				{basePath}
				triageEnabled={data.triageEnabled}
				activeSessionId={view.sessionId}
				sort={view.sort}
				next={data.next}
				sessions={data.sessions}
				header={view.sessionId ? undefined : recentStrip}
				onLoaded={({ sessions, next }) => {
					data.sessions = [...data.sessions, ...sessions];
					data.next = next;
				}}
			></SessionList>
		{:else if view.kind === 'archived'}
			<div class="h-full overflow-y-auto px-4 pt-5 pb-12 sm:px-7">
				<ArchivedSessions sessions={data.archived} />
			</div>
		{:else}
			<div class="h-full overflow-y-auto px-4 pt-5 pb-12 sm:px-7">
				{#if data.photos.length}
					<ContactSheet photos={data.photos} groupBy={view.kind === 'tag' ? 'session' : 'day'} />
				{:else}
					<p class="py-16 text-center text-sm text-neutral-500">{view.kind === 'tag' ? 'No photos carry this tag.' : 'No edited photos yet.'}</p>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.views { display: flex; flex-shrink: 0; align-items: stretch; gap: 20px; overflow-x: auto; padding: 0 20px; border-bottom: 1px solid #262626; scrollbar-width: none; }
	@media (min-width: 640px) { .views { gap: 24px; padding: 0 28px; } }
	.views::-webkit-scrollbar { display: none; }
	.views a { display: flex; flex-shrink: 0; align-items: center; gap: 6px; min-height: 44px; padding: 10px 2px; border-bottom: 2px solid transparent; color: #737373; font-size: 13px; font-weight: 500; white-space: nowrap; transition: color 120ms, border-color 120ms; }
	.views a:hover { color: #d4d4d4; }
	.views a[aria-current='page'] { border-bottom-color: #f5f5f5; color: #f5f5f5; }
	.views a:focus-visible { outline: 2px solid #fff; outline-offset: -2px; border-radius: 4px; }
	.count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: #1f1f1f; color: #a3a3a3; font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; transition: background-color 120ms, color 120ms; }
	.views a[aria-current='page'] .count { background: #2e2e2e; color: #f5f5f5; }
	/* One scrolling row of recent edits, each at its real shape. */
	.strip { display: flex; gap: 6px; overflow-x: auto; scroll-snap-type: x proximity; scrollbar-width: none; padding-bottom: 2px; }
	.strip::-webkit-scrollbar { display: none; }
	.strip a { flex-shrink: 0; height: 132px; overflow: hidden; border-radius: 6px; background: #171717; scroll-snap-align: start; }
	@media (min-width: 768px) { .strip a { height: 168px; } }
	.strip img { display: block; height: 100%; width: auto; }
	.strip a:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
</style>
