<script lang="ts">
	import type { EditorTool } from '$lib/editor-tools';
	import { IconAdjustmentsHorizontal, IconCrop } from './icons';
	import IconBandage from '@tabler/icons-svelte/icons/bandage';
	import MaskToolIcon from './MaskToolIcon.svelte';
	let { tool, size = 20 }: { tool: EditorTool; size?: number } = $props();
</script>

{#if tool === 'crop'}<IconCrop {size} />
{:else if tool === 'retouch'}<IconBandage {size} />
{:else if tool === 'masks'}<MaskToolIcon {size} />
{:else}<IconAdjustmentsHorizontal {size} />{/if}
