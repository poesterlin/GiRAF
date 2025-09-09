<script lang="ts">
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { parsePP3, stringifyPP3 } from '$lib/pp3-utils';
	import { edits } from '$lib/state/editing.svelte';
	import FlagModal from './FlagModal.svelte';
	import {
		IconAdjustmentsHorizontal,
		IconArrowBackUp,
		IconArrowForwardUp,
		IconCameraFilled,
		IconCheck,
		IconClipboard,
		IconCopy,
		IconCrop,
		IconFlag,
		IconRestore
	} from '$lib/ui/icons';
	import { IconFlagFilled } from '@tabler/icons-svelte';

	interface Props {
		img: string;
		showSnapshots?: boolean;
		showCrop?: boolean;
		showUndoRedo?: boolean;
		showReset?: boolean;
		showEdit?: boolean;
		showClipboard?: boolean;
		showFlag?: boolean;
		isFlagged?: boolean;
	}

	let { img, showSnapshots, showCrop, showUndoRedo, showReset, showEdit, showClipboard, showFlag, isFlagged }: Props = $props();

	let showFlagModal = $state(false);
	let copiedConfig = $state(false);
	let pastedConfig = $state(false);
	let hasClipboardContent = $state(false);

	async function getClipboardPermissionState() {
		if (!browser) return 'unsupported';
		if (typeof navigator === 'undefined' || !navigator.permissions) return 'unsupported';
		try {
			const status = await navigator.permissions.query({
				// @ts-expect-error - not in the spec yet
				name: 'clipboard-read'
			});
			return status.state; // 'granted' | 'denied' | 'prompt'
		} catch {
			// Browser may not support this descriptor
			return 'unsupported';
		}
	}

	async function checkClipboard() {
		let pp3Text: string | null = null;

		// TODO: if the permission is not jet set, dont request it
		const hasPermission = await getClipboardPermissionState();
		if (hasPermission !== 'granted') {
			return;
		}

		// try clipboard readText
		if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
			try {
				const txt = await navigator.clipboard.readText();
				if (txt && txt.trim().length > 0) {
					pp3Text = txt;
				}
			} catch {
				// ignore and try localStorage
			}
		}

		// fallback to localStorage
		if (!pp3Text) {
			try {
				const stored = localStorage.getItem('raw-editor_pp3_clipboard');
				if (stored && stored.trim().length > 0) {
					pp3Text = stored;
				}
			} catch {
				// ignore
			}
		}

		if (pp3Text) {
			try {
				// just check if it's parsable
				parsePP3(pp3Text);
				hasClipboardContent = true;
			} catch {
				hasClipboardContent = false;
			}
		} else {
			hasClipboardContent = false;
		}
	}

	// Copy current PP3 to clipboard and localStorage as fallback
	async function copyConfig() {
		const pp3String = stringifyPP3(edits.pp3);
		let success = false;

		// try writing to clipboard first
		if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
			try {
				await navigator.clipboard.writeText(pp3String);
				success = true;
			} catch {
				// ignore, fallback to localStorage below
				success = false;
			}
		}

		// save to localStorage as fallback/persistent copy
		try {
			localStorage.setItem('raw-editor_pp3_clipboard', pp3String);
			success = true;
		} catch {
			// ignore localStorage errors
		}

		copiedConfig = success;
		if (success) {
			hasClipboardContent = true;
		}
		setTimeout(() => (copiedConfig = false), 2000);
	}

	// Paste PP3 from clipboard or localStorage and apply to current edits
	async function pasteConfig() {
		let pp3Text: string | null = null;

		// try clipboard readText
		if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
			try {
				const txt = await navigator.clipboard.readText();
				if (txt && txt.trim().length > 0) {
					pp3Text = txt;
				}
			} catch {
				// ignore and try localStorage
			}
		}

		// fallback to localStorage
		if (!pp3Text) {
			try {
				const stored = localStorage.getItem('raw-editor_pp3_clipboard');
				if (stored && stored.trim().length > 0) {
					pp3Text = stored;
				}
			} catch {
				// ignore
			}
		}

		if (!pp3Text) {
			// nothing to paste
			pastedConfig = false;
			return;
		}

		// try to parse PP3 text and apply
		try {
			edits.pp3 = parsePP3(pp3Text);
			pastedConfig = true;
			setTimeout(() => (pastedConfig = false), 2000);
		} catch {
			pastedConfig = false;
		}
	}
</script>

<svelte:window onfocus={() => checkClipboard()} />

<nav>
	{#if showUndoRedo}
		<button disabled={!edits.canRedo} onclick={edits.redo} aria-label="Redo">
			<IconArrowBackUp />
		</button>
		<button disabled={!edits.canUndo} onclick={edits.undo} aria-label="Undo">
			<IconArrowForwardUp />
		</button>
	{/if}
	{#if showReset && edits.canUndo}
		<button class="reset-btn" onclick={() => {}} aria-label="Reset All">
			<IconRestore />
		</button>
	{/if}

	<!-- navigation -->
	{#if showCrop}
		<a href="/editor/{img}/crop" aria-label="Crop">
			<IconCrop />
		</a>
	{/if}
	{#if showEdit}
		<a href="/editor/{img}" aria-label="Edit">
			<IconAdjustmentsHorizontal />
		</a>
	{/if}

	<!-- flag button -->
	{#if showFlag}
		<button class="border-2 border-yellow-400" onclick={() => (showFlagModal = true)} aria-label="Flagged">
			{#if isFlagged}
				<IconFlagFilled />
			{:else}
				<IconFlag />
			{/if}
		</button>
	{/if}

	<!-- version snapshots -->
	{#if showSnapshots}
		<a href="?snapshot" aria-label="Snapshots">
			<IconCameraFilled />
		</a>
	{/if}

	<!-- Copy / Paste config buttons -->
	{#if showClipboard}
		<button onclick={copyConfig} aria-label="Copy edit config">
			{#if copiedConfig}
				<IconCheck />
			{:else}
				<IconCopy />
			{/if}
		</button>
		{#if hasClipboardContent}
			<button onclick={pasteConfig} aria-label="Paste edit config">
				{#if pastedConfig}
					<IconCheck />
				{:else}
					<IconClipboard />
				{/if}
			</button>
		{/if}
	{/if}
</nav>

{#if showFlagModal}
	<FlagModal {img} onClose={() => (showFlagModal = false)} />
{/if}

<style>
	nav {
		position: absolute;
		inset: 0 auto 0 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		height: max-content;
		background: rgba(0, 0, 0, 0.1);
		backdrop-filter: blur(10px);
		border-radius: 8px;
		margin: auto;
		padding: 0.4rem;
		z-index: 100;
		gap: 0.5rem;
	}

	a,
	button {
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), transparent);
		backdrop-filter: blur(30px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		padding: 0.5rem;
		border-radius: 4px;
		color: rgb(196, 196, 196);
		font-size: 0.9rem;
		min-width: 2.7rem;
		text-align: center;

		& > :global(svg) {
			width: 2rem;
			height: 2rem;
		}
	}

	a:hover,
	button:hover {
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.2), transparent);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	button:disabled {
		opacity: 0.8;
		color: rgba(196, 196, 196, 0.5);
		pointer-events: none;
	}
</style>
