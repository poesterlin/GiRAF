<div class="container mx-auto flex h-full flex-col items-center justify-center p-8">
	<div class="text-center">
		<h1 class="mb-4 text-5xl font-bold text-neutral-100">Raw Editor</h1>
		<p class="mb-16 max-w-2xl text-lg text-neutral-300">
			A streamlined workflow for professional photo editing. Navigate through the process using the
			links above.
		</p>
	</div>

	<div
		class="grid grid-cols-1 gap-x-4 gap-y-8 text-center md:grid-cols-2 md:text-left lg:grid-cols-4"
	>
		<!-- Importer -->
		<div class="flex flex-col items-center rounded-lg bg-neutral-900 p-6 shadow-lg md:items-start">
			<h2 class="mb-2 text-2xl font-semibold text-neutral-50">1. Importer</h2>
			<p class="mb-4 flex-grow text-neutral-400">
				Start by importing your RAW files. The application watches a designated folder for new images
				and adds them to your import queue.
			</p>
			<a
				href="/importer"
				class="mt-auto rounded-md bg-neutral-800 px-4 py-2 text-neutral-200 transition-colors hover:bg-neutral-700"
			>
				Go to Importer
			</a>
		</div>

		<!-- Gallery -->
		<div class="flex flex-col items-center rounded-lg bg-neutral-900 p-6 shadow-lg md:items-start">
			<h2 class="mb-2 text-2xl font-semibold text-neutral-50">2. Gallery</h2>
			<p class="mb-4 flex-grow text-neutral-400">
				Browse your imported image sessions. The gallery provides a quick overview of your photos,
				organized by import date.
			</p>
			<a
				href="/gallery"
				class="mt-auto rounded-md bg-neutral-800 px-4 py-2 text-neutral-200 transition-colors hover:bg-neutral-700"
			>
				Go to Gallery
			</a>
		</div>

		<!-- Editor -->
		<div class="flex flex-col items-center rounded-lg bg-neutral-900 p-6 shadow-lg md:items-start">
			<h2 class="mb-2 text-2xl font-semibold text-neutral-50">3. Editor</h2>
			<p class="mb-4 flex-grow text-neutral-400">
				The heart of the application. Make detailed adjustments to your images using a powerful,
				non-destructive editor.
			</p>
			<a
				href="/editor"
				class="mt-auto rounded-md bg-neutral-800 px-4 py-2 text-neutral-200 transition-colors hover:bg-neutral-700"
			>
				Go to Editor
			</a>
		</div>

		<!-- Exporter -->
		<div class="flex flex-col items-center rounded-lg bg-neutral-900 p-6 shadow-lg md:items-start">
			<h2 class="mb-2 text-2xl font-semibold text-neutral-50">4. Exporter</h2>
			<p class="mb-4 flex-grow text-neutral-400">
				When you're done editing, export your images. The exporter shows you which sessions have
				pending changes and lets you process them.
			</p>
			<a
				href="/exporter"
				class="mt-auto rounded-md bg-neutral-800 px-4 py-2 text-neutral-200 transition-colors hover:bg-neutral-700"
			>
				Go to Exporter
			</a>
		</div>
	</div>
</div>