<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { app } from '$lib/state/app.svelte';
	import type { ArchivedSession } from '$lib/server/library';
	import { photoThumbnail } from './ContactSheet.svelte';
	import { IconArchive } from './icons';

	let { sessions }: { sessions: ArchivedSession[] } = $props();
	let restoring = $state<number>();
	// Cover files can be gone once a session is archived, so drop any that fail to load.
	let broken = $state<Set<number>>(new Set());

	const dates = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

	function covers(session: ArchivedSession) {
		return session.cover.filter((photo) => !broken.has(photo.id));
	}

	async function restore(session: ArchivedSession) {
		if (restoring !== undefined) return;
		restoring = session.id;
		try {
			const response = await fetch(`/api/sessions/${session.id}/archive`, { method: 'DELETE' });
			if (!response.ok) throw new Error();
			app.addToast(`Restored ${session.name}.`, 'success');
			await invalidateAll();
		} catch {
			app.addToast(`Could not restore ${session.name}.`, 'error');
		} finally {
			restoring = undefined;
		}
	}
</script>

{#if sessions.length}
	<ul class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
		{#each sessions as session (session.id)}
			{@const cover = covers(session)}
			<li class="card">
				<a href={cover[0] ? `/editor/${cover[0].id}` : undefined} class="mosaic" class:single={cover.length < 2} aria-label={`Open ${session.name}`}>
					{#each cover as photo (photo.id)}
						<img src={photoThumbnail(photo)} alt="" loading="lazy" decoding="async" draggable="false" onerror={() => (broken = new Set([...broken, photo.id]))} />
					{:else}
						<span class="empty"><IconArchive size={28} /></span>
					{/each}
				</a>
				<div class="flex items-center justify-between gap-3 p-3 pl-4">
					<div class="min-w-0">
						<h2 class="truncate text-sm font-semibold text-neutral-100">{session.name}</h2>
						<p class="text-xs text-neutral-500">{dates.format(new Date(session.startedAt))} · {session.imageCount} photo{session.imageCount === 1 ? '' : 's'}</p>
					</div>
					<button type="button" class="restore" disabled={restoring !== undefined} onclick={() => restore(session)}>
						{restoring === session.id ? 'Restoring…' : 'Restore'}
					</button>
				</div>
			</li>
		{/each}
	</ul>
{:else}
	<p class="py-16 text-center text-sm text-neutral-500">No archived sessions.</p>
{/if}

<style>
	.card { overflow: hidden; border-radius: 12px; background: #141414; outline: 1px solid #262626; }
	.mosaic { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; aspect-ratio: 3 / 2; background: #0a0a0a; }
	.mosaic.single { grid-template-columns: 1fr; }
	.mosaic img { width: 100%; height: 100%; min-height: 0; object-fit: cover; opacity: .75; transition: opacity 150ms; }
	/* Three photos: the first spans the top row so the mosaic has no gap. */
	.mosaic img:first-child:nth-last-child(3) { grid-column: span 2; }
	.mosaic:hover img { opacity: 1; }
	.mosaic:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
	.empty { display: flex; grid-column: 1 / -1; align-items: center; justify-content: center; color: #525252; }
	.restore { flex-shrink: 0; min-height: 44px; padding: 0 16px; border-radius: 10px; background: #262626; color: #f5f5f5; font-size: 13px; font-weight: 600; transition: background-color 120ms; }
	.restore:hover:not(:disabled) { background: #f5f5f5; color: #0a0a0a; }
	.restore:disabled { opacity: .5; }
	.restore:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
</style>
