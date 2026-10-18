<script lang="ts">
	import { IconFlag, IconLayoutGrid } from '$lib/ui/icons';
</script>

<div class="flex h-full flex-col items-center justify-center p-6 text-center font-sans lg:p-12">
	<div class="mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-neutral-900 text-neutral-500 shadow-inner ring-1 ring-neutral-800">
		<IconFlag size={48} stroke-width={1.5} />
	</div>

	<h1 class="mb-4 text-4xl font-black tracking-tight text-neutral-100 italic">
		TRIAGE<span class="font-light text-neutral-500 not-italic">MODE</span>
	</h1>

	<p class="mb-10 max-w-md text-lg leading-relaxed font-medium text-neutral-400">
		Select a session from your gallery to begin the selection process. Cull and organize your best shots with speed.
	</p>

	<a
		href="/gallery"
		class="group flex items-center gap-3 rounded-2xl bg-neutral-100 px-8 py-4 text-sm font-bold tracking-widest text-neutral-950 uppercase shadow-xl transition-all hover:scale-[1.02] hover:bg-neutral-200 active:scale-95"
	>
		<IconLayoutGrid size={20} />
		Go to Gallery
		<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
		</svg>
	</a>
</div>
