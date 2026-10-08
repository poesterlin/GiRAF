<script lang="ts">
	import { onDestroy } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import pLimit from 'p-limit';
	import { extractLocalPhotoPreview } from '$lib/local-photo-preview';
	import { uploads, type UploadSessionTarget } from '$lib/state/uploads.svelte';
	import { app } from '$lib/state/app.svelte';
	import { checkUploadDuplicates, fingerprintFile } from '$lib/upload-duplicates';

	let { sessions }: { sessions: { id: number; name: string; isArchived?: boolean }[] } = $props();
	type Entry = {
		id: string;
		file: File;
		url?: string;
		capturedAt?: Date;
		previewError?: string;
		selected: boolean;
		target?: UploadSessionTarget;
		submitted: boolean;
		status?: string;
		checking?: boolean;
		sha256?: string;
	};
	let entries = $state<Entry[]>([]);
	let mode = $state<'new' | 'existing'>('new');
	let name = $state('');
	let sessionId = $state('');
	let submitting = $state(false);
	let alive = true;
	const previewLimit = pLimit(2);
	let selected = $derived(entries.filter((entry) => entry.selected && !entry.submitted && !entry.checking));
	let assigned = $derived(entries.filter((entry) => entry.target && !entry.submitted && !entry.checking));
	let ordered = $derived(
		[...entries].sort((a, b) => (a.capturedAt?.getTime() ?? a.file.lastModified) - (b.capturedAt?.getTime() ?? b.file.lastModified) || a.file.name.localeCompare(b.file.name))
	);
	async function thumbnail(url: string): Promise<string> {
		if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return url;
		let bitmap: ImageBitmap | undefined;
		try {
			const blob = await (await fetch(url)).blob();
			bitmap = await createImageBitmap(blob, { resizeWidth: 480 });
			const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
			const context = canvas.getContext('2d');
			if (!context) return url;
			context.drawImage(bitmap, 0, 0);
			const result = URL.createObjectURL(await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 }));
			URL.revokeObjectURL(url);
			return result;
		} catch {
			return url;
		} finally {
			bitmap?.close();
		}
	}

	export function stage(files: FileList | File[]) {
		for (const file of Array.from(files)) {
			if (entries.some((entry) => entry.file.name === file.name && entry.file.size === file.size && entry.file.lastModified === file.lastModified)) continue;
			const id = crypto.randomUUID();
			entries.push({ id, file, selected: true, submitted: false, checking: true, status: 'Checking for duplicates…' });
			void previewLimit(async () => {
				if (!alive || !entries.some((entry) => entry.id === id)) return;
				try {
					const preview = await extractLocalPhotoPreview(file);
					preview.url = await thumbnail(preview.url);
					const entry = entries.find((entry) => entry.id === id);
					if (!alive || !entry) {
						URL.revokeObjectURL(preview.url);
						return;
					}
					entry.url = preview.url;
					entry.capturedAt = preview.capturedAt;
				} catch (error) {
					const entry = entries.find((entry) => entry.id === id);
					if (entry) entry.previewError = error instanceof Error ? error.message : 'Preview unavailable';
				}
				try {
					const sha256 = await fingerprintFile(file);
					let entry = entries.find((entry) => entry.id === id);
					if (!alive || !entry) return;
					const localDuplicate = entries.some((other) => other.id !== id && other.sha256 === sha256);
					entry.sha256 = sha256;
					if (localDuplicate) {
						entry.submitted = true; entry.selected = false; entry.status = 'Duplicate of another selected file';
					} else {
						const [check] = await checkUploadDuplicates([file]);
						entry = entries.find((entry) => entry.id === id);
						if (!alive || !entry) return;
						if (check.duplicate && check.imported) { entry.submitted = true; entry.selected = false; entry.status = 'Already imported — no upload needed'; }
						else entry.status = check.duplicate ? 'Already uploaded — choose a session' : undefined;
					}
				} catch {
					const entry = entries.find((entry) => entry.id === id);
					if (entry) entry.status = 'Duplicate check unavailable — will retry before upload';
				} finally {
					const entry = entries.find((entry) => entry.id === id);
					if (entry) entry.checking = false;
				}
			});
		}
	}

	function assign() {
		const target: UploadSessionTarget = mode === 'new' ? { name: name.trim() } : { sessionId: Number(sessionId) };
		if (mode === 'new' ? !target.name : !target.sessionId) return;
		for (const entry of selected) {
			entry.target = { ...target };
			entry.selected = false;
		}
	}
	function targetLabel(target: UploadSessionTarget) {
		return target.name ?? sessions.find((session) => session.id === target.sessionId)?.name ?? `Session ${target.sessionId}`;
	}
	function removeSelected() {
		for (const entry of selected) if (entry.url) URL.revokeObjectURL(entry.url);
		entries = entries.filter((entry) => !selected.includes(entry));
	}
	async function uploadAssigned() {
		submitting = true;
		const groups = new SvelteMap<string, { files: File[]; target: UploadSessionTarget; entries: Entry[] }>();
		for (const entry of assigned) {
			const target = { ...entry.target! };
			const key = JSON.stringify(target);
			const group = groups.get(key) ?? { files: [], target, entries: [] };
			group.files.push(entry.file);
			group.entries.push(entry);
			groups.set(key, group);
			entry.submitted = true;
			entry.selected = false;
			entry.status = 'Queued for upload';
		}
		try {
			for (const group of groups.values()) {
				for (const entry of group.entries) entry.status = 'Uploading…';
				const result = await uploads.upload(group.files, group.target);
				const assignedIds = new Set<string>();
				for (const entry of group.entries) {
					if (result.sessionId) entry.target = { sessionId: result.sessionId };
					if (result.failedFiles.includes(entry.file)) {
						entry.submitted = false;
						entry.status = 'Upload failed — retry available';
					} else if (!result.assignmentFailed && result.sessionId) {
						assignedIds.add(entry.id);
						if (entry.url) URL.revokeObjectURL(entry.url);
					} else entry.status = result.assignmentFailed ? 'Uploaded — assign in server queue' : 'Uploaded';
				}
				entries = entries.filter((entry) => !assignedIds.has(entry.id));
			}
		} catch (error) {
			app.addToast(error instanceof Error ? error.message : 'Upload could not be started', 'error');
		} finally {
			submitting = false;
		}
	}
	onDestroy(() => {
		alive = false;
		previewLimit.clearQueue();
		for (const entry of entries) if (entry.url) URL.revokeObjectURL(entry.url);
	});
</script>

{#if entries.length}
	<section class="mb-10 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4" aria-label="Local photos awaiting upload">
		<h2 class="text-lg font-bold text-neutral-100">Organize before uploading</h2>
		<p class="mt-1 text-sm text-neutral-400">Select photos and assign them to sessions. Previews stay on your device until you upload. Keep this page open while organizing.</p>
		<div class="my-4 flex flex-wrap items-center gap-3 text-sm">
			<button
				class="rounded-lg bg-neutral-800 px-3 py-2"
				onclick={() => {
					for (const entry of entries) if (!entry.submitted) entry.selected = true;
				}}>Select all</button
			>
			<button
				class="rounded-lg bg-neutral-800 px-3 py-2"
				onclick={() => {
					for (const entry of entries) entry.selected = false;
				}}>Clear selection</button
			>
			<button class="rounded-lg bg-neutral-800 px-3 py-2 disabled:opacity-40" disabled={!selected.length} onclick={removeSelected}>Remove selected</button>
			<span class="text-neutral-400">{selected.length} selected · {assigned.length} ready</span>
		</div>
		<div class="mb-4 flex flex-wrap items-center gap-3">
			<select aria-label="Session assignment type" bind:value={mode} class="rounded-lg bg-neutral-800 p-2"
				><option value="new">New session</option><option value="existing">Existing session</option></select
			>
			{#if mode === 'new'}
				<input aria-label="New session name" placeholder="Session name" bind:value={name} class="rounded-lg bg-neutral-800 p-2" />
			{:else}
				<select aria-label="Existing session" bind:value={sessionId} class="max-w-full rounded-lg bg-neutral-800 p-2"
					><option value="">Choose a session</option>{#each sessions.filter((session) => !session.isArchived) as session (session.id)}<option value={String(session.id)}>{session.name}</option
						>{/each}</select
				>
			{/if}
			<button
				class="rounded-lg bg-neutral-100 px-4 py-2 font-semibold text-neutral-950 disabled:opacity-40"
				disabled={!selected.length || (mode === 'new' ? !name.trim() : !sessionId)}
				onclick={assign}>Assign selected</button
			>
			<button class="rounded-lg bg-neutral-700 px-4 py-2 font-semibold text-white disabled:opacity-40" disabled={!assigned.length || submitting} onclick={uploadAssigned}
				>{submitting ? 'Uploading groups…' : `Upload ${assigned.length} assigned photos`}</button
			>
		</div>
		<div class="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
			{#each ordered as entry (entry.id)}
				<button
					class="overflow-hidden rounded-xl border-2 bg-neutral-900 text-left disabled:opacity-60"
					class:border-neutral-300={entry.selected}
					class:border-neutral-800={!entry.selected}
					disabled={entry.submitted || entry.checking}
					onclick={() => {
						entry.selected = !entry.selected;
					}}
					aria-pressed={entry.selected}
					aria-label={`Select ${entry.file.name}`}
				>
					<div class="flex aspect-[3/2] items-center justify-center bg-neutral-800">
						{#if entry.url}<img
								src={entry.url}
								alt={entry.file.name}
								class="h-full w-full object-contain"
								onerror={() => {
									entry.previewError = 'Preview cannot be displayed';
									if (entry.url) URL.revokeObjectURL(entry.url);
									entry.url = undefined;
								}}
							/>{:else}<span class="px-2 text-center text-xs text-neutral-400">{entry.previewError ? 'Preview unavailable' : 'Reading local preview…'}</span>{/if}
					</div>
					<div class="p-2 text-xs">
						<p class="truncate text-neutral-100">{entry.file.name}</p>
						<p class="text-neutral-500">
							{(entry.file.size / 1_000_000).toFixed(1)} MB{entry.capturedAt ? ` · ${entry.capturedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
						</p>
						<p class="mt-1 truncate text-neutral-100">{entry.target ? targetLabel(entry.target) : 'No session assigned'}</p>
						{#if entry.status}<p class="mt-1 text-neutral-400">{entry.status}</p>{/if}
					</div>
				</button>
			{/each}
		</div>
	</section>
{/if}
