<script lang="ts" module>
	import type { LibraryPhoto } from '$lib/server/library';

	/** The newest edit where a photo has one, so looks can be compared as they will export. */
	export function photoThumbnail(photo: LibraryPhoto) {
		return photo.snapshotId
			? `/api/images/${photo.id}/edited-thumbnail?snapshot=${photo.snapshotId}&version=${photo.version}`
			: `/api/images/${photo.id}/preview?version=${photo.version}&size=400`;
	}
</script>

<script lang="ts">
	let { photos, groupBy }: { photos: LibraryPhoto[]; groupBy: 'day' | 'session' } = $props();

	function dayLabel(iso: string) {
		const date = new Date(iso);
		const today = new Date();
		const days = Math.round((new Date(today.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000);
		if (days === 0) return 'Today';
		if (days === 1) return 'Yesterday';
		if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
		return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }) });
	}

	const groups = $derived.by(() => {
		const result: { key: string; label: string; photos: LibraryPhoto[] }[] = [];
		for (const photo of photos) {
			const key = groupBy === 'session' ? `s${photo.sessionId}` : photo.editedAt ? new Date(photo.editedAt).toDateString() : 'unedited';
			let group = result.at(-1);
			if (group?.key !== key) {
				group = { key, label: groupBy === 'session' ? photo.sessionName : photo.editedAt ? dayLabel(photo.editedAt) : 'Not edited', photos: [] };
				result.push(group);
			}
			group.photos.push(photo);
		}
		return result;
	});
</script>

<div class="space-y-8">
	{#each groups as group (group.key)}
		<section aria-label={group.label}>
			<h2 class="mb-3 flex items-baseline gap-2 text-sm font-semibold text-neutral-200">
				{group.label}<span class="font-normal text-neutral-500">{group.photos.length}</span>
			</h2>
			<div class="sheet">
				{#each group.photos as photo (photo.id)}
					<a href={`/editor/${photo.id}`} class="tile" aria-label={`Edit photo from ${photo.sessionName}`}>
						<!-- The size attributes give a 3:2 placeholder until the real shape is known. -->
						<img src={photoThumbnail(photo)} alt="" width="300" height="200" loading="lazy" decoding="async" draggable="false" />
						{#if groupBy !== 'session'}<span class="caption">{photo.sessionName}</span>{/if}
					</a>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	/* Justified rows: every photo keeps its shape at one row height, and rows stretch to fill the width. */
	.sheet {
		--row: 132px;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.sheet::after {
		content: '';
		flex-grow: 999;
	}
	@media (min-width: 768px) {
		.sheet {
			--row: 190px;
			gap: 6px;
		}
	}
	.tile {
		position: relative;
		flex: 1 1 auto;
		height: var(--row);
		overflow: hidden;
		border-radius: 6px;
		background: #171717;
	}
	.tile img {
		display: block;
		height: 100%;
		width: auto;
		min-width: 100%;
		max-width: none;
		object-fit: cover;
		transition: transform 300ms ease-out;
	}
	.caption {
		position: absolute;
		inset: auto 0 0 0;
		padding: 16px 8px 6px;
		background: linear-gradient(transparent, #000c);
		color: #e5e5e5;
		font-size: 11px;
		opacity: 0;
		transition: opacity 150ms;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tile:hover .caption,
	.tile:focus-visible .caption {
		opacity: 1;
	}
	.tile:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
	@media (hover: hover) and (prefers-reduced-motion: no-preference) {
		.tile:hover img {
			transform: scale(1.03);
		}
	}
</style>
