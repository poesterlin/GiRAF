<script lang="ts">
	import SessionList from './SessionList.svelte';

	let { data } = $props();
</script>

<SessionList
	next={data.next}
	sessions={data.sessions}
	onLoaded={({ sessions, next }) => {
		data.sessions = [...data.sessions, ...sessions];
		data.next = next;
	}}
></SessionList>

<style>
	:global(main) {
		overflow: hidden;
		padding-bottom: 2rem;
	}
</style>
