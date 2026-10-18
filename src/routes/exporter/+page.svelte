<script lang="ts">
	import SessionList from './SessionList.svelte';

	let { data } = $props();
</script>

<div class="relative flex h-full flex-col bg-black">
	<div class="mx-auto w-full max-w-7xl px-4 pt-5 pb-5 sm:p-6 lg:p-12 lg:pb-6">
		<div class="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
			<div>
				<h1 class="mb-2 text-2xl font-black tracking-tighter text-neutral-100 uppercase italic sm:text-5xl">Exporter</h1>
				<p class="max-w-md text-sm font-medium text-neutral-400 sm:text-base">Export sessions to your photo services or local storage.</p>
			</div>
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-hidden px-4 sm:px-6 lg:px-12">
		<div class="mx-auto h-full max-w-7xl">
			<SessionList
				sessions={data.sessions}
				next={data.next}
				onLoaded={({ sessions, next }) => {
					data.sessions = [...data.sessions, ...sessions];
					data.next = next;
				}}
				integrations={data.configuredIntegrations}
			/>
		</div>
	</div>
</div>

<style>
	/* Elegant Scrollbar */
	:global(::-webkit-scrollbar) {
		width: 6px;
	}
	:global(::-webkit-scrollbar-track) {
		background: black;
	}
	:global(::-webkit-scrollbar-thumb) {
		background: #262626;
		border-radius: 10px;
	}
	:global(::-webkit-scrollbar-thumb:hover) {
		background: #404040;
	}
</style>
