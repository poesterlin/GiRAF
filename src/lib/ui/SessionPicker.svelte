<script lang="ts">
	import type { Session } from "$lib/server/db/schema";

	type SessionWithImages = Session & { images: { id: number }[] };

	let { sessions, value = $bindable() }: { sessions: SessionWithImages[], value: number | null } = $props();

</script>

<div class="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto rounded-lg bg-neutral-900 p-2">
	{#each sessions as session}
		<button
			type="button"
			class="relative aspect-4/3 overflow-hidden rounded-md border-2 transition-all"
			class:border-blue-500={value === session.id}
			class:border-transparent={value !== session.id}
			onclick={() => (value = session.id)}
		>
			{#if session.images.length > 0}
				<img
					src={`/api/images/${session.images[0].id}/preview`}
					alt={session.name}
					class="h-full w-full object-cover"
				/>
			{:else}
				<div class="flex h-full w-full items-center justify-center bg-neutral-800">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-8 w-8 text-neutral-600">
						<path fill-rule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V6c0-.414.336-.75.75-.75h16.5A.75.75 0 0121 6v10.06l-3.572-3.572a.75.75 0 00-1.06 0l-3.09 3.09-2.12-2.122a.75.75 0 00-1.061 0l-4.188 4.189-.001.001zM10.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" clip-rule="evenodd" />
					  </svg>
				</div>
			{/if}
			<div class="absolute inset-x-0 bottom-0 bg-black/60 p-2 text-center text-xs font-medium text-white backdrop-blur-sm">
				{session.name}
			</div>
		</button>
	{/each}
</div>
