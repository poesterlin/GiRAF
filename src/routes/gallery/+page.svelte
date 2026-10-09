<script lang="ts">
	import SessionList from '$lib/ui/SessionList.svelte';

	let { data } = $props();

	let basePath = $derived(data.triageEnabled ? 'triage' as const : 'editor' as const);
</script>

<SessionList
	allowRename
	{basePath}
	triageEnabled={data.triageEnabled}
	next={data.next}
	sessions={data.sessions}
	onLoaded={({ sessions, next }) => {
		data.sessions = [...data.sessions, ...sessions];
		data.next = next;
	}}
></SessionList>

<style>
	
</style>
