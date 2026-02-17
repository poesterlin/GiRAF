<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { countPP3Properties, diffPP3, parsePP3, stringifyPP3 } from '$lib/pp3-utils';
	import {
		IconAdjustmentsHorizontal,
		IconGitBranch,
		IconCheck,
		IconClipboard,
		IconCopy,
		IconCrop,
		IconFilter,
		IconFlag,
		IconHistory,
	} from '$lib/ui/icons';
	import { IconFlagFilled } from '@tabler/icons-svelte';
	import FilterModal from './FilterModal.svelte';
	import FlagModal from './FlagModal.svelte';
	import Tooltip from './Tooltip.svelte';
	import { edits } from '$lib/state/editing.svelte';

	interface Props {
		img: string;
		showSnapshots?: boolean;
		showCrop?: boolean;
		// showUndoRedo?: boolean;
		// showReset?: boolean;
		showEdit?: boolean;
		showClipboard?: boolean;
		showFlag?: boolean;
		showLast?: boolean;
		showFilter?: boolean;
		isFlagged?: boolean;
	}

	let { img, showSnapshots, showCrop, showEdit, showClipboard, showFlag, isFlagged, showLast, showFilter }: Props = $props();

	let showFlagModal = $state(false);
	let showFilterModal = $state(false);
	let copiedConfig = $state(false);
	let pastedConfig = $state(false);
	let hasClipboardContent = $state(false);
	let isDesktop = $state(false);

	if (browser) {
		const mediaQuery = window.matchMedia('(min-width: 1024px)');
		isDesktop = mediaQuery.matches;
		mediaQuery.addEventListener('change', (e) => (isDesktop = e.matches));
	}

	const tooltipPosition = $derived(isDesktop ? 'right' : 'top');
	const iconSize = $derived(isDesktop ? 24 : 20);

	const keyMap = $derived(
		new Map<string, () => void>([
			['c', () => copyConfig()],
			['v', () => pasteConfig()]
		])
	);

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
				const stored = localStorage.getItem('giraf_pp3_clipboard');
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
			localStorage.setItem('giraf_pp3_clipboard', pp3String);
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
				const stored = localStorage.getItem('giraf_pp3_clipboard');
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
			edits.pushHistory();
			pastedConfig = true;
			setTimeout(() => (pastedConfig = false), 2000);
		} catch {
			pastedConfig = false;
		}
	}

	function handleKeyUp(event: KeyboardEvent) {
		if (event.target && (event.target as HTMLElement).tagName === 'INPUT') {
			return; // Ignore key events when focused on input fields
		}
		const action = keyMap.get(event.key);
		if (action) {
			event.preventDefault();
			action();
		}
	}
</script>

<svelte:window onfocus={() => checkClipboard()} onkeyup={handleKeyUp} />

<nav class="flex flex-row lg:flex-col items-center gap-1 rounded-full border border-neutral-800/50 bg-neutral-950/40 p-1 backdrop-blur-xl shadow-2xl">
	
	<!-- {#if showReset && edits.canUndo}
		<button 
			class="flex h-10 w-10 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90" 
			onclick={() => {}} 
			aria-label="Reset All"
		>
			<IconRestore size={20} />
		</button>
	{/if} -->

	<!-- navigation -->
	{#if showCrop}
		<Tooltip text="Crop & Rotate" position={tooltipPosition}>
			<a 
				href="/editor/{img}/crop" 
				aria-label="Crop"
				class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90"
			>
				<IconCrop size={iconSize} />
			</a>
		</Tooltip>
	{/if}
	{#if showEdit}
		<Tooltip text="Adjustments" position={tooltipPosition}>
			<a 
				href="/editor/{img}" 
				aria-label="Edit"
				class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90"
			>
				<IconAdjustmentsHorizontal size={iconSize} />
			</a>
		</Tooltip>
	{/if}

	<!-- flag button -->
	{#if showFlag}
		<Tooltip text={isFlagged ? "Remove Flag" : "Flag as Favorite"} position={tooltipPosition}>
			<button 
				class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full transition-all hover:bg-neutral-800 active:scale-90" 
				class:text-yellow-500={isFlagged}
				class:text-neutral-400={!isFlagged}
				onclick={() => (showFlagModal = true)} 
				aria-label="Flagged"
			>
				{#if isFlagged}
					<IconFlagFilled size={iconSize} />
				{:else}
					<IconFlag size={iconSize} />
				{/if}
			</button>
		</Tooltip>
	{/if}

	<!-- last version -->
	{#if showLast && edits.lastSavedPP3 && countPP3Properties(diffPP3(edits.lastSavedPP3, edits.pp3)) > 0}
		<Tooltip text="Load Last Saved Version" position={tooltipPosition}>
			<button 
				class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90"
				onclick={() => edits.initialize(edits.lastSavedPP3, page.data.image)} 
				aria-label="Load Last Version"
			>
				<IconHistory size={iconSize} />
			</button>
		</Tooltip>
	{/if}

	<!-- version snapshots -->
	{#if showSnapshots}
		<Tooltip text="Snapshots" position={tooltipPosition}>
			<a 
				href="?snapshot" 
				aria-label="Snapshots"
				class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90"
			>
				<IconGitBranch size={iconSize} />
			</a>
		</Tooltip>
	{/if}

	<!-- filter button -->
	{#if showFilter}
		{@const filter = page.url.searchParams.get('filter')}
		{@const hasFilter = filter !== null && filter !== 'none'}
		<Tooltip text="Filter Gallery" position={tooltipPosition}>
			<button 
				class:bg-neutral-700={hasFilter}
				class:text-neutral-100={hasFilter}
				class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 active:scale-90"
				onclick={() => (showFilterModal = true)} 
				aria-label="Filters"
			>
				<IconFilter size={iconSize} />
			</button>
		</Tooltip>
	{/if}

	<!-- Copy / Paste config buttons -->
	{#if showClipboard}
		<Tooltip text={copiedConfig ? "Copied!" : "Copy Edit Config"} position={tooltipPosition}>
			<button 
				onclick={copyConfig} 
				aria-label="Copy edit config"
				class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full transition-all hover:bg-neutral-800 active:scale-90"
				class:text-green-500={copiedConfig}
				class:text-neutral-400={!copiedConfig}
			>
				{#if copiedConfig}
					<IconCheck size={iconSize} />
				{:else}
					<IconCopy size={iconSize} />
				{/if}
			</button>
		</Tooltip>
		{#if hasClipboardContent}
			<Tooltip text={pastedConfig ? "Pasted!" : "Paste Edit Config"} position={tooltipPosition}>
				<button 
					onclick={pasteConfig} 
					aria-label="Paste edit config"
					class="flex h-10 w-10 lg:h-12 lg:w-12 items-center justify-center rounded-full transition-all hover:bg-neutral-800 active:scale-90"
					class:text-blue-500={pastedConfig}
					class:text-neutral-400={!pastedConfig}
				>
					{#if pastedConfig}
						<IconCheck size={iconSize} />
					{:else}
						<IconClipboard size={iconSize} />
					{/if}
				</button>
			</Tooltip>
		{/if}
	{/if}
</nav>

{#if showFlagModal}
	<FlagModal {img} onClose={() => (showFlagModal = false)} />
{/if}

{#if showFilterModal}
    <FilterModal onClose={() => (showFilterModal = false)} />
{/if}
