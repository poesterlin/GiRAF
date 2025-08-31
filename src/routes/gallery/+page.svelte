<script lang="ts">
	import SessionList from './SessionList.svelte';

	let { data } = $props();
</script>

<div class="p-4 sm:p-6 md:p-8">
	<h1 class="mb-6 text-2xl font-bold text-neutral-50 sm:mb-8 sm:text-3xl">Gallery</h1>
	<SessionList
		next={data.next}
		sessions={data.sessions}
		onLoaded={({ sessions, next }) => {
			data.sessions = [...data.sessions, ...sessions];
			data.next = next;
		}}
	></SessionList>
</div>
