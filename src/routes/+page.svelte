<script lang="ts">
	import { IconCameraPlus, IconLayoutGrid, IconAdjustmentsHorizontal, IconArchive } from '$lib/ui/icons';
</script>

<div class="mx-auto flex max-w-7xl h-full max-h-full overflow-auto flex-col items-center sm:justify-center p-6 pt-12 lg:p-12">
	<div class="text-center mb-16 lg:mb-24">
		<h1 class="mb-6 text-6xl lg:text-8xl font-black tracking-tighter text-neutral-100 italic">
			RAW<span class="text-neutral-500 not-italic font-light">EDITOR</span>
		</h1>
		<p class="mx-auto max-w-2xl text-lg lg:text-xl text-neutral-400 font-medium leading-relaxed">
			A streamlined, non-destructive workflow for professional photo editing. 
			Harness the power of RawTherapee from any device.
		</p>
	</div>

	<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 w-full">
		<!-- Importer -->
		<a href="/importer" class="group flex flex-col items-start rounded-3xl bg-neutral-900/40 border border-neutral-800 p-8 transition-all hover:bg-neutral-900 hover:border-neutral-700 hover:shadow-2xl">
			<div class="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-400 group-hover:bg-neutral-100 group-hover:text-neutral-950 transition-colors">
				<IconCameraPlus size={32} />
			</div>
			<h2 class="mb-3 text-2xl font-bold text-neutral-100 tracking-tight">Importer</h2>
			<p class="text-neutral-500 text-sm leading-relaxed mb-6">
				Designate watch folders and ingest your RAW files directly into the processing queue.
			</p>
			<span class="mt-auto inline-flex items-center gap-2 text-sm font-bold text-neutral-100">
				Get Started
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</span>
		</a>

		<!-- Gallery -->
		<a href="/gallery" class="group flex flex-col items-start rounded-3xl bg-neutral-900/40 border border-neutral-800 p-8 transition-all hover:bg-neutral-900 hover:border-neutral-700 hover:shadow-2xl">
			<div class="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-400 group-hover:bg-neutral-100 group-hover:text-neutral-950 transition-colors">
				<IconLayoutGrid size={32} />
			</div>
			<h2 class="mb-3 text-2xl font-bold text-neutral-100 tracking-tight">Gallery</h2>
			<p class="text-neutral-500 text-sm leading-relaxed mb-6">
				Browse sessions, manage metadata, and keep your growing collection organized.
			</p>
			<span class="mt-auto inline-flex items-center gap-2 text-sm font-bold text-neutral-100">
				View Library
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</span>
		</a>

		<!-- Editor -->
		<a href="/editor" class="group flex flex-col items-start rounded-3xl bg-neutral-900/40 border border-neutral-800 p-8 transition-all hover:bg-neutral-900 hover:border-neutral-700 hover:shadow-2xl">
			<div class="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-400 group-hover:bg-neutral-100 group-hover:text-neutral-950 transition-colors">
				<IconAdjustmentsHorizontal size={32} />
			</div>
			<h2 class="mb-3 text-2xl font-bold text-neutral-100 tracking-tight">Editor</h2>
			<p class="text-neutral-500 text-sm leading-relaxed mb-6">
				Precision adjustments with real-time feedback. Non-destructive editing at its best.
			</p>
			<span class="mt-auto inline-flex items-center gap-2 text-sm font-bold text-neutral-100">
				Start Editing
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</span>
		</a>

		<!-- Exporter -->
		<a href="/exporter" class="group flex flex-col items-start rounded-3xl bg-neutral-900/40 border border-neutral-800 p-8 transition-all hover:bg-neutral-900 hover:border-neutral-700 hover:shadow-2xl">
			<div class="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-400 group-hover:bg-neutral-100 group-hover:text-neutral-950 transition-colors">
				<IconArchive size={32} />
			</div>
			<h2 class="mb-3 text-2xl font-bold text-neutral-100 tracking-tight">Exporter</h2>
			<p class="text-neutral-500 text-sm leading-relaxed mb-6">
				Finalize your vision. Batch export images to Google Photos, Immich, or local storage.
			</p>
			<span class="mt-auto inline-flex items-center gap-2 text-sm font-bold text-neutral-100">
				Export Files
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</span>
		</a>
	</div>
</div>