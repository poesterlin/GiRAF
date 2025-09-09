<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { toBase64 } from '$lib/pp3-utils';
	import type { Profile, Snapshot } from '$lib/server/db/schema';
	import { edits } from '$lib/state/editing.svelte';
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

	async function deleteSnapshot(snapshotId: number) {
		if (confirm('Are you sure you want to delete this snapshot?')) {
			await fetch(`/api/images/${page.params.img}/snapshots/${snapshotId}`, {
				method: 'DELETE'
			});
			snapshots = snapshots.filter((s) => s.id !== snapshotId);
			invalidateAll();
		}
	}

	async function saveAsProfile(snapshot: Snapshot) {
		if (!profileName) return;

		const response = await fetch('/api/profiles', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ name: profileName, pp3: snapshot.pp3 })
		});

		if (response.ok) {
			profiles = [await response.json(), ...profiles];
			showSaveAsProfile = null;
			profileName = '';
			activeTab = 'profiles';
		}
	}

	async function deleteProfile(profileId: number) {
		if (confirm('Are you sure you want to delete this profile?')) {
			await fetch(`/api/profiles/${profileId}`, {
				method: 'DELETE'
			});
			profiles = profiles.filter((p) => p.id !== profileId);
		}
	}
</script>

<Modal onClose={() => goto(`/editor/${page.params.img}`)} class="p-0">
	<div class="flex border-b border-neutral-800">
		<button
			onclick={() => (activeTab = 'snapshots')}
			class="px-4 pb-3 pt-6 text-sm font-medium text-neutral-400 transition-colors {activeTab === 'snapshots' ? 'border-b-2 border-neutral-500 text-white' : ''}"
		>
			Snapshots
		</button>
		<button
			onclick={() => (activeTab = 'profiles')}
			class="px-4 pb-3 pt-6 text-sm font-medium text-neutral-400 transition-colors {activeTab === 'profiles' ? 'border-b-2 border-neutral-500 text-white' : ''}"
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
								<button class="action-button" onclick={() => edits.initialize(snapshot.pp3, page.data.image)}>Apply</button>
								<button class="action-button" onclick={() => (showSaveAsProfile = snapshot.id)}>
									<IconDeviceFloppy size={16} />
								</button>
								<button class="action-button" onclick={() => deleteSnapshot(snapshot.id)}>
									<IconTrash size={16} />
								</button>
							</div>
						</div>
						{#if showSaveAsProfile === snapshot.id}
							<form onsubmit={preventDefault(() => saveAsProfile(snapshot))} class="save-form">
								<input type="text" bind:value={profileName} placeholder="Profile Name" class="input" />
								<button type="submit" class="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700">Save</button>
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
								<button class="action-button" onclick={() => edits.initialize(profile.pp3, page.data.image)}>Apply</button>
								<button class="action-button" onclick={() => deleteProfile(profile.id)}>
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
