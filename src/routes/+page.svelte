<script lang="ts">
	import { IconCameraPlus, IconLayoutGrid, IconAdjustmentsHorizontal, IconArchive } from '$lib/ui/icons';
</script>

<div class="mx-auto flex h-full max-h-full max-w-7xl flex-col items-center overflow-auto p-6 pt-12 sm:justify-center lg:p-12">
	<div class="mb-16 text-center lg:mb-24">
		<h1 class="mb-6 text-6xl font-black tracking-tighter text-neutral-100 uppercase italic lg:text-9xl">
			Gi<span class="font-light text-neutral-500 not-italic">RAF</span>
		</h1>
		<p class="mx-auto max-w-2xl text-lg leading-relaxed font-medium text-neutral-400 lg:text-xl">
			A streamlined, non-destructive workflow for professional photo editing. Harness the power of RawTherapee from any device.
		</p>
	</div>

	<div class="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
		<!-- Importer -->
		<a
			href="/importer"
			class="group flex flex-col items-start rounded-3xl border border-neutral-800 bg-neutral-900/40 p-8 transition-all hover:border-neutral-700 hover:bg-neutral-900 hover:shadow-2xl"
		>
			<div
				class="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-400 transition-colors group-hover:bg-neutral-100 group-hover:text-neutral-950"
			>
				<IconCameraPlus size={32} />
			</div>
			<h2 class="mb-3 text-2xl font-bold tracking-tight text-neutral-100">Importer</h2>
			<p class="mb-6 text-sm leading-relaxed text-neutral-500">Designate watch folders and ingest your RAW files directly into the processing queue.</p>
			<span class="mt-auto inline-flex items-center gap-2 text-sm font-bold text-neutral-100">
				Get Started
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</span>
		</a>

		<!-- Gallery -->
		<a
			href="/gallery"
			class="group flex flex-col items-start rounded-3xl border border-neutral-800 bg-neutral-900/40 p-8 transition-all hover:border-neutral-700 hover:bg-neutral-900 hover:shadow-2xl"
		>
			<div
				class="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-400 transition-colors group-hover:bg-neutral-100 group-hover:text-neutral-950"
			>
				<IconLayoutGrid size={32} />
			</div>
			<h2 class="mb-3 text-2xl font-bold tracking-tight text-neutral-100">Gallery</h2>
			<p class="mb-6 text-sm leading-relaxed text-neutral-500">Browse sessions, manage metadata, and keep your growing collection organized.</p>
			<span class="mt-auto inline-flex items-center gap-2 text-sm font-bold text-neutral-100">
				View Library
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</span>
		</a>

		<!-- Editor -->
		<a
			href="/gallery?view=recent"
			class="group flex flex-col items-start rounded-3xl border border-neutral-800 bg-neutral-900/40 p-8 transition-all hover:border-neutral-700 hover:bg-neutral-900 hover:shadow-2xl"
		>
			<div
				class="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-400 transition-colors group-hover:bg-neutral-100 group-hover:text-neutral-950"
			>
				<IconAdjustmentsHorizontal size={32} />
			</div>
			<h2 class="mb-3 text-2xl font-bold tracking-tight text-neutral-100">Editor</h2>
			<p class="mb-6 text-sm leading-relaxed text-neutral-500">Precision adjustments with real-time feedback. Non-destructive editing at its best.</p>
			<span class="mt-auto inline-flex items-center gap-2 text-sm font-bold text-neutral-100">
				Start Editing
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</span>
		</a>

		<!-- Exporter -->
		<a
			href="/exporter"
			class="group flex flex-col items-start rounded-3xl border border-neutral-800 bg-neutral-900/40 p-8 transition-all hover:border-neutral-700 hover:bg-neutral-900 hover:shadow-2xl"
		>
			<div
				class="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-400 transition-colors group-hover:bg-neutral-100 group-hover:text-neutral-950"
			>
				<IconArchive size={32} />
			</div>
			<h2 class="mb-3 text-2xl font-bold tracking-tight text-neutral-100">Exporter</h2>
			<p class="mb-6 text-sm leading-relaxed text-neutral-500">Finalize your vision. Batch export images to Google Photos, Immich, or local storage.</p>
			<span class="mt-auto inline-flex items-center gap-2 text-sm font-bold text-neutral-100">
				Export Files
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</span>
		</a>
	</div>
</div>
