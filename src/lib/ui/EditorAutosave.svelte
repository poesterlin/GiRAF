<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, untrack } from 'svelte';
	import { edits } from '$lib/state/editing.svelte';
	import { app } from '$lib/state/app.svelte';

	/** How long an edit has to be still before it is written. */
	const IDLE_DELAY_MS = 2000;

	type SnapshotRow = { id: number; createdAt: string; pp3: string };

	function report(error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		app.addToast(`Save failed: ${message}`, 'error');
	}

	/** A failed save is tried again, so a network blip does not leave the edit unsaved until the next change. */
	const RETRY_DELAY_MS = 5000;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	let reportedFailure = false;

	async function flush() {
		clearTimeout(retryTimer);
		if (!edits.hasChanges) return;
		try {
			await edits.snapshot();
			reportedFailure = false;
		} catch (error) {
			// One toast per outage; the retries stay quiet
			if (!reportedFailure) report(error);
			reportedFailure = true;
			retryTimer = setTimeout(() => void flush(), RETRY_DELAY_MS);
		}
	}

	onDestroy(() => clearTimeout(retryTimer));

	// Autosave writes once the edit settles instead of on every slider step.
	$effect(() => {
		// Reading the revision re-arms the timer after every recorded change.
		edits.changeRevision;
		const imageId = edits.currentImageId;
		if (!imageId || !edits.hasChanges) return;
		const timer = setTimeout(() => void flush(), IDLE_DELAY_MS);
		return () => clearTimeout(timer);
	});

	// The newest saved version decides whether a save updates it or adds one.
	$effect(() => {
		const imageId = page.params.img;
		if (!imageId) return;
		const snapshots = (page.data as { snapshots?: SnapshotRow[] }).snapshots;
		const image = (page.data as { image?: { lastExportedAt?: string | null } }).image;
		const version = snapshots?.[0] ?? null;
		const exportedAt = image?.lastExportedAt ?? null;
		// Recording a version writes state this effect would otherwise re-read.
		untrack(() => edits.noteSavedVersion(imageId, version, exportedAt));
	});

	// Leaving the editor or the tab must not lose the last change.
	beforeNavigate(() => void flush());

	function onVisibilityChange() {
		if (document.visibilityState === 'hidden') void flush();
	}
</script>

<svelte:window
	onvisibilitychange={onVisibilityChange}
	onpagehide={() => void flush()}
	onbeforeunload={(event) => {
		// Only when a save has failed does closing the tab lose work
		if (edits.hasChanges && edits.isFaulty) event.preventDefault();
	}}
/>
