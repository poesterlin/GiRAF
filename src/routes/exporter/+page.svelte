<script lang="ts">
	import SessionList from './SessionList.svelte';

	let { data } = $props();
</script>

<div class="p-4 sm:p-6 md:p-8">
	<h1 class="text-2xl sm:text-3xl font-bold text-neutral-50 mb-6 sm:mb-8">Exporter</h1>
	<div class="max-w-4xl mx-auto">
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
