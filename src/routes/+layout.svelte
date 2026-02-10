<script lang="ts">
	import { page } from '$app/state';
	import logo from '$lib/assets/logo.webp';
	import { onNavigate } from '$app/navigation';
	import { onDestroy, onMount } from 'svelte';
	import { app } from '$lib/state/app.svelte';
	import { edits } from '$lib/state/editing.svelte';
	import {
		IconCameraFilled,
		IconCameraPlus,
		IconLayoutGrid,
		IconFlag,
		IconAdjustmentsHorizontal,
		IconArchive,
		IconBell,
		IconUser
	} from '$lib/ui/icons';
	import '../app.css';

	let { children, data } = $props();
	type ServerNotification = {
		id: string;
		message: string;
		type: 'success' | 'error' | 'info';
		createdAt: string;
		read: boolean;
	};

	let currentRoute = $derived(page.route?.id);
	let galleryActive = $derived(currentRoute?.startsWith('/gallery'));
	let editorActive = $derived(currentRoute?.startsWith('/editor'));
	let exporterActive = $derived(currentRoute?.startsWith('/exporter'));
	let importerActive = $derived(currentRoute?.startsWith('/importer'));
	let triageActive = $derived(currentRoute?.startsWith('/triage'));

	let triageEnabled = $derived(data.triageEnabled);
	let showNotifications = $state(false);
	let runningTaskCount = $state(0);
	let runningTasksPollingInterval: ReturnType<typeof setInterval> | undefined;
	let notificationsPollingInterval: ReturnType<typeof setInterval> | undefined;
	let knownNotificationIds = new Set<string>();
	let notificationsAriaLabel = $derived(
		runningTaskCount > 0
			? `Open notifications. ${runningTaskCount} task${runningTaskCount === 1 ? '' : 's'} running`
			: 'Open notifications'
	);

	function toggleNotifications() {
		showNotifications = !showNotifications;
		if (showNotifications) {
			void app.markAllNotificationsRead();
		}
	}

	$effect(() => {
		edits.update(edits.pp3);
	});

	$effect(() => {
		const notifications =
			((data as { notifications?: ServerNotification[] }).notifications as ServerNotification[] | undefined) ?? [];
		const mapped = notifications.map((notification) => ({
			...notification,
			createdAt: new Date(notification.createdAt)
		}));
		knownNotificationIds = new Set(mapped.map((notification) => notification.id));
		app.setNotifications(mapped);
	});

	function syncNotifications(notifications: ServerNotification[], emitToasts: boolean) {
		const mapped = notifications.map((notification) => ({
			...notification,
			createdAt: new Date(notification.createdAt)
		}));
		const nextIds = new Set(mapped.map((notification) => notification.id));
		if (emitToasts) {
			for (const notification of mapped) {
				if (!knownNotificationIds.has(notification.id)) {
					app.addToast(notification.message, notification.type);
				}
			}
		}
		knownNotificationIds = nextIds;
		app.setNotifications(mapped);
	}

	async function refreshNotifications() {
		try {
			const response = await fetch('/api/notifications');
			if (!response.ok) {
				return;
			}

			const payload = (await response.json()) as { notifications?: ServerNotification[] };
			if (!Array.isArray(payload.notifications)) {
				return;
			}
			syncNotifications(payload.notifications, true);
		} catch {
			// Keep the last known state when polling fails.
		}
	}

	async function refreshRunningTasks() {
		try {
			const response = await fetch('/api/jobs');
			if (!response.ok) {
				return;
			}

			const payload = (await response.json()) as { runningCount?: number };
			runningTaskCount = Number.isFinite(payload.runningCount) ? Math.max(0, Number(payload.runningCount)) : 0;
		} catch {
			// Keep the last known state when polling fails.
		}
	}

	onMount(() => {
		void refreshRunningTasks();
		void refreshNotifications();
		runningTasksPollingInterval = setInterval(() => {
			void refreshRunningTasks();
		}, 2000);
		notificationsPollingInterval = setInterval(() => {
			void refreshNotifications();
		}, 2000);
	});

	onDestroy(() => {
		if (runningTasksPollingInterval) {
			clearInterval(runningTasksPollingInterval);
			runningTasksPollingInterval = undefined;
		}
		if (notificationsPollingInterval) {
			clearInterval(notificationsPollingInterval);
			notificationsPollingInterval = undefined;
		}
	});

	onNavigate((navigation) => {
		if (!document.startViewTransition) {
			return;
		}

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={logo} />
</svelte:head>

<div class="grid h-screen grid-rows-[auto_1fr] bg-neutral-950 text-neutral-200 font-sans">
	<header
		class="z-50 flex items-center justify-between border-b border-neutral-800/50 bg-neutral-950/80 px-3 py-3 backdrop-blur-md sm:px-6"
	>
		<!-- Brand -->
		<a href="/" class="flex items-center gap-2 sm:gap-3">
			<img src={logo} alt="GiRAF Logo" class="h-8 w-8 sm:h-9 sm:w-9 rounded-full" />
			<span class="hidden text-base font-bold tracking-tight text-neutral-100 sm:text-lg lg:block uppercase">
				Gi<span class="font-light text-neutral-500">RAF</span>
			</span>
		</a>

		<!-- Main Nav -->
		<nav class="flex items-center rounded-full border border-neutral-800/50 bg-neutral-900/40 p-1 shadow-inner">
			<a
				href="/importer"
				class="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4"
				class:bg-neutral-100={importerActive}
				class:text-neutral-950={importerActive}
				class:text-neutral-400={!importerActive}
				class:hover:text-neutral-100={!importerActive}
			>
				<IconCameraPlus size={18} />
				<span class="hidden md:block">Import</span>
			</a>
			<a
				href="/gallery"
				class="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4"
				class:bg-neutral-100={galleryActive}
				class:text-neutral-950={galleryActive}
				class:text-neutral-400={!galleryActive}
				class:hover:text-neutral-100={!galleryActive}
			>
				<IconLayoutGrid size={18} />
				<span class="hidden md:block">Gallery</span>
			</a>
			{#if triageEnabled}
				<a
					href="/triage"
					class="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4"
					class:bg-neutral-100={triageActive}
					class:text-neutral-950={triageActive}
					class:text-neutral-400={!triageActive}
					class:hover:text-neutral-100={!triageActive}
				>
					<IconFlag size={18} />
					<span class="hidden md:block">Triage</span>
				</a>
			{/if}
			<a
				href="/editor"
				class="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4"
				class:bg-neutral-100={editorActive}
				class:text-neutral-950={editorActive}
				class:text-neutral-400={!editorActive}
				class:hover:text-neutral-100={!editorActive}
			>
				<IconAdjustmentsHorizontal size={18} />
				<span class="hidden md:block">Editor</span>
			</a>
			<a
				href="/exporter"
				class="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all sm:px-4"
				class:bg-neutral-100={exporterActive}
				class:text-neutral-950={exporterActive}
				class:text-neutral-400={!exporterActive}
				class:hover:text-neutral-100={!exporterActive}
			>
				<IconArchive size={18} />
				<span class="hidden md:block">Export</span>
			</a>
		</nav>

		<!-- Utilities -->
		<div class="relative flex items-center gap-2">
			<button
				type="button"
				class="relative flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-100 sm:h-9 sm:w-9"
				aria-label={notificationsAriaLabel}
				onclick={toggleNotifications}
			>
				<IconBell size={20} />
				{#if runningTaskCount > 0}
					<span class="absolute top-1 right-1 inline-flex h-3 w-3 items-center justify-center" aria-hidden="true">
						<span class="running-ring absolute inset-0 rounded-full border border-neutral-100/70"></span>
						<span class="running-dot h-1.5 w-1.5 rounded-full bg-neutral-100"></span>
					</span>
				{/if}
			</button>

			{#if showNotifications}
				<div
					class="absolute top-11 right-10 z-80 w-80 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/95 shadow-2xl backdrop-blur-md"
				>
					<div class="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
						<p class="text-xs font-semibold uppercase tracking-wider text-neutral-400">Notifications</p>
						{#if app.notifications.length > 0}
							<button
								type="button"
								class="text-xs text-neutral-500 transition-colors hover:text-neutral-200"
								onclick={() => void app.clearNotifications()}
							>
								Clear
							</button>
						{/if}
					</div>

					<div class="max-h-72 overflow-y-auto">
						{#if app.notifications.length === 0}
							<p class="px-3 py-4 text-sm text-neutral-500">No notifications yet.</p>
						{:else}
							{#each app.notifications as notification (notification.id)}
								{@const typeColor = {
									success: 'bg-green-500',
									error: 'bg-red-500',
									info: 'bg-blue-500'
								}[notification.type]}
								<div class="border-b border-neutral-800/70 px-3 py-2 last:border-b-0">
									<div class="flex items-start gap-2">
										<span class={`mt-1 h-2 w-2 shrink-0 rounded-full ${typeColor}`}></span>
										<div class="min-w-0 flex-1">
											<p class="text-sm text-neutral-200">{notification.message}</p>
											<p class="mt-1 text-[11px] text-neutral-500">
												{new Date(notification.createdAt).toLocaleTimeString()}
											</p>
										</div>
									</div>
								</div>
							{/each}
						{/if}
					</div>
				</div>
			{/if}

			<a
				href="/settings"
				class="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-100 sm:h-9 sm:w-9"
			>
				<IconUser size={20} />
		</a>
		</div>
	</header>
	<main>
		{@render children?.()}
	</main>
</div>

<!-- toasts -->
<div class="fixed right-4 bottom-4 z-80 flex flex-col items-end gap-2">
	{#each app.toasts as toast (toast.id)}
		{@const bg = {
			success: 'bg-green-600/90',
			error: 'bg-red-600/90',
			info: 'bg-neutral-800/90'
		}[toast.type]}
		<div class="rounded-lg {bg} z-80 px-4 py-2 text-sm font-medium text-neutral-50 shadow-lg backdrop-blur-sm">
			{toast.message}
		</div>
	{/each}
</div>

<style>
	@keyframes running-dot-pulse {
		0%,
		100% {
			transform: scale(0.9);
			opacity: 1;
		}
		50% {
			transform: scale(1.15);
			opacity: 0.7;
		}
	}

	@keyframes running-ring-ping {
		0% {
			transform: scale(0.85);
			opacity: 0.9;
		}
		100% {
			transform: scale(1.5);
			opacity: 0;
		}
	}

	.running-dot {
		animation: running-dot-pulse 1.2s ease-in-out infinite;
	}

	.running-ring {
		animation: running-ring-ping 1.2s ease-out infinite;
	}

	/* @keyframes fade-in {
		from {
			opacity: 0;
		}
	}

	@keyframes fade-out {
		to {
			opacity: 0;
		}
	}

	::view-transition-old(root) {
		animation: 90ms cubic-bezier(0.4, 0, 1, 1) both fade-out;
	}

	::view-transition-new(root) {
		animation: 210ms cubic-bezier(0, 0, 0.2, 1) 90ms both fade-in;
	} */

	:global(main) {
		position: relative;
		overflow: hidden;
	}
</style>
