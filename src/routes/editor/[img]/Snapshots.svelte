<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { toBase64 } from '$lib/pp3-utils';
	import type { Profile, Snapshot } from '$lib/server/db/schema';
	import { app } from '$lib/state/app.svelte';
	import { edits } from '$lib/state/editing.svelte';
	import ConfirmModal from '$lib/ui/ConfirmModal.svelte';
	import { IconDeviceFloppy, IconTrash } from '$lib/ui/icons';
	import Modal from '$lib/ui/Modal.svelte';
	import { preventDefault } from '$lib/ui/utils';

	interface Props {
		snapshots: Snapshot[];
		profiles: Profile[];
	}

	let { snapshots, profiles }: Props = $props();

	let activeTab = $state('snapshots');
	let showSaveAsProfile = $state<number | null>(null);
	let profileName = $state('');

	// Applying is an ordinary edit: undoable and picked up by autosave, even with unsaved changes
	function applyVersion(pp3: string) {
		edits.reset(pp3, page.data.image);
		app.addToast('Applied to this photo.', 'info');
	}

	let pendingDelete = $state<{ kind: 'snapshot' | 'profile'; id: number } | null>(null);

	async function request(url: string, init: RequestInit, failure: string) {
		try {
			const response = await fetch(url, init);
			if (response.ok) return response;
		} catch (error) {
			console.error(failure, error);
		}
		app.addToast(failure, 'error');
		return null;
	}

	async function confirmDelete() {
		const target = pendingDelete;
		pendingDelete = null;
		if (!target) return;
		if (target.kind === 'snapshot') {
			if (!(await request(`/api/images/${page.params.img}/snapshots/${target.id}`, { method: 'DELETE' }, 'Failed to delete snapshot.'))) return;
			snapshots = snapshots.filter((s) => s.id !== target.id);
			invalidateAll();
		} else {
			if (!(await request(`/api/profiles/${target.id}`, { method: 'DELETE' }, 'Failed to delete profile.'))) return;
			profiles = profiles.filter((p) => p.id !== target.id);
		}
	}

	async function saveAsProfile(snapshot: Snapshot) {
		const name = profileName.trim();
		if (!name) {
			app.addToast('Enter a name for the profile.', 'info');
			return;
		}

		const response = await request(
			'/api/profiles',
			{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, pp3: snapshot.pp3 }) },
			'Failed to save profile.'
		);
		if (!response) return;
		profiles = [await response.json(), ...profiles];
		showSaveAsProfile = null;
		profileName = '';
		activeTab = 'profiles';
	}
</script>

<Modal onClose={() => goto(`/editor/${page.params.img}`)} class="p-0">
	<div class="flex border-b border-neutral-800">
		<button
			onclick={() => (activeTab = 'snapshots')}
			class="px-4 pt-6 pb-3 text-sm font-medium text-neutral-400 transition-colors {activeTab === 'snapshots' ? 'border-b-2 border-neutral-500 text-white' : ''}"
		>
			Snapshots
		</button>
		<button
			onclick={() => (activeTab = 'profiles')}
			class="px-4 pt-6 pb-3 text-sm font-medium text-neutral-400 transition-colors {activeTab === 'profiles' ? 'border-b-2 border-neutral-500 text-white' : ''}"
		>
			Profiles
		</button>
	</div>

	<div class="p-5">
		{#if activeTab === 'snapshots'}
			<h2 class="mb-6 text-xl font-semibold text-white">Image Snapshots</h2>
			<div class="list">
				{#each snapshots as snapshot (snapshot.id)}
					<div class="item">
						<img src={`/api/images/${page.params.img}/edit?preview&config=${toBase64(snapshot.pp3)}`} alt="Snapshot" class="preview" loading="lazy" />
						<div class="info">
							<div class="actions">
								<button class="action-button" onclick={() => applyVersion(snapshot.pp3)}>Apply</button>
								<button class="action-button" aria-label="Save as profile" title="Save as profile" onclick={() => (showSaveAsProfile = snapshot.id)}>
									<IconDeviceFloppy size={16} />
								</button>
								<button class="action-button" aria-label="Delete snapshot" title="Delete snapshot" onclick={() => (pendingDelete = { kind: 'snapshot', id: snapshot.id })}>
									<IconTrash size={16} />
								</button>
							</div>
						</div>
						{#if showSaveAsProfile === snapshot.id}
							<form onsubmit={preventDefault(() => saveAsProfile(snapshot))} class="save-form">
								<input type="text" bind:value={profileName} placeholder="Profile Name" aria-label="Profile name" class="input" />
								<button type="submit" class="rounded-md bg-neutral-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-700">Save</button>
							</form>
						{/if}
					</div>
				{:else}
					<p class="text-neutral-500">No snapshots available for this image.</p>
				{/each}
			</div>
		{:else if activeTab === 'profiles'}
			<h2 class="mb-6 text-xl font-semibold text-white">Global Profiles</h2>
			<div class="list">
				{#each profiles as profile (profile.id)}
					<div class="item">
						<img src={`/api/images/${page.params.img}/edit?preview&config=${toBase64(profile.pp3)}`} alt={profile.name} class="preview" loading="lazy" />
						<div class="info">
							<span class="font-semibold">{profile.name}</span>
							<div class="actions">
								<button class="action-button" onclick={() => applyVersion(profile.pp3)}>Apply</button>
								<button class="action-button" aria-label="Delete profile" title="Delete profile" onclick={() => (pendingDelete = { kind: 'profile', id: profile.id })}>
									<IconTrash size={16} />
								</button>
							</div>
						</div>
					</div>
				{:else}
					<p class="text-neutral-500">No global profiles saved yet.</p>
				{/each}
			</div>
		{/if}
	</div>
</Modal>

{#if pendingDelete}
	<ConfirmModal
		title={pendingDelete.kind === 'snapshot' ? 'Delete snapshot?' : 'Delete profile?'}
		message={pendingDelete.kind === 'snapshot' ? 'This snapshot will be permanently removed.' : 'This profile will be removed for all images.'}
		confirmLabel="Delete"
		onConfirm={confirmDelete}
		onCancel={() => (pendingDelete = null)}
	/>
{/if}

<style>
	.list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 1rem;
		max-height: 70vh;
		overflow-y: auto;
		padding-right: 0.5rem; /* For scrollbar */
	}

	.item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: var(--bg-3);
		padding: 0.5rem;
		border-radius: 8px;
		border: 1px solid var(--border-1);
	}

	.preview {
		width: 100%;
		height: auto;
		aspect-ratio: 3 / 2;
		object-fit: cover;
		border-radius: 6px;
	}

	.info {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.25rem;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.action-button {
		padding: 0.25rem 0.75rem;
		background: var(--bg-4);
		border: 1px solid var(--border-2);
		border-radius: 6px;
		color: var(--text-2);
		cursor: pointer;
		transition: background 0.2s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.action-button:hover {
		background: #3a3a3a;
	}

	.save-form {
		display: flex;
		gap: 0.5rem;
		padding: 0.25rem;
	}

	.input {
		flex: 1;
		background: var(--bg-1);
		border: 1px solid var(--border-2);
		color: var(--text-1);
		padding: 0.5rem;
		border-radius: 6px;
		font-size: 0.875rem;
		min-width: 0;
	}
</style>
