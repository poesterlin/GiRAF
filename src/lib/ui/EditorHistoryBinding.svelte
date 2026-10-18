<script lang="ts">
	import { edits } from '$lib/state/editing.svelte';
	import { getContext } from 'svelte';
	import { editorHistoryKey, type EditorHistoryActions } from '$lib/editor-history';
	let {
		onundo = () => edits.undo(),
		onredo = () => edits.redo(),
		loading = false
	}: {
		onundo?: () => void;
		onredo?: () => void;
		loading?: boolean;
	} = $props();
	const historyActions = getContext<EditorHistoryActions | undefined>(editorHistoryKey);
	$effect(() => {
		if (!historyActions) return;
		historyActions.undo = onundo;
		historyActions.redo = onredo;
		historyActions.loading = loading;
		return () => {
			historyActions.undo = () => edits.undo();
			historyActions.redo = () => edits.redo();
			historyActions.loading = false;
		};
	});
</script>
