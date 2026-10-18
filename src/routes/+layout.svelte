<script lang="ts">
	import { page } from '$app/state';
	import logo from '$lib/assets/logo.webp';
	import { onNavigate } from '$app/navigation';
	import { onDestroy, onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	// Modal dialogs live in the browser's top layer and would cover a normal toast. A popover joins
	// the same layer, and re-showing it whenever a toast arrives lifts it above any dialog opened since.
	let toastLayer = $state<HTMLElement>();
	$effect(() => {
		const layer = toastLayer;
		const visible = app.toasts.length > 0;
		if (!layer?.showPopover) return;
		if (layer.matches(':popover-open')) layer.hidePopover();
		if (visible) layer.showPopover();
	});
	import UploadProgress from '$lib/ui/UploadProgress.svelte';
	import NavigationProgress from '$lib/ui/NavigationProgress.svelte';
	import { uploads } from '$lib/state/uploads.svelte';
	import { app } from '$lib/state/app.svelte';
	import FlowNav from '$lib/ui/FlowNav.svelte';
	import { IconBell, IconUser } from '$lib/ui/icons';
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
	let editorActive = $derived(currentRoute?.startsWith('/editor'));

	let triageEnabled = $derived(data.triageEnabled);
	let session = $derived((page.data as { session?: { id: number; name: string } | null } | null)?.session ?? null);
	let sessionName = $derived(session?.name ?? null);
	let sessionId = $derived(session?.id ?? null);
	let showNotifications = $state(false);
	let notificationsButton = $state<HTMLButtonElement>();
	let notificationsPanel = $state<HTMLDivElement>();
	let runningTaskCount = $state(0);
	let runningTasksPollingInterval: ReturnType<typeof setInterval> | undefined;
	let notificationsPollingInterval: ReturnType<typeof setInterval> | undefined;
	let knownNotificationIds = new Set<string>();
	let totalRunningTasks = $derived(runningTaskCount + (uploads.isUploading ? 1 : 0));
	let notificationsAriaLabel = $derived(
		totalRunningTasks > 0 ? `Open notifications. ${totalRunningTasks} task${totalRunningTasks === 1 ? '' : 's'} running` : 'Open notifications'
	);

	function toggleNotifications() {
		showNotifications = !showNotifications;
		if (showNotifications) {
			void app.markAllNotificationsRead();
		}
	}

	function closeNotificationsOutside(event: PointerEvent) {
		if (!showNotifications || !(event.target instanceof Node)) return;
		if (notificationsButton?.contains(event.target) || notificationsPanel?.contains(event.target)) return;
		showNotifications = false;
	}

	$effect(() => {
		const notifications = ((data as { notifications?: ServerNotification[] }).notifications as ServerNotification[] | undefined) ?? [];
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
				if (!knownNotificationIds.has(notification.id) && !(notification.type !== 'error' && /^Import (started|completed) for /.test(notification.message))) {
					app.addToast(notification.message, notification.type);
				}
			}
		}
		knownNotificationIds = nextIds;
		app.setNotifications(mapped);
	}

	async function refreshNotifications() {
		if (app.notificationMutations) return;
		const version = app.notificationVersion;
		try {
			const response = await fetch('/api/notifications');
			if (!response.ok) {
				return;
			}

			const payload = (await response.json()) as { notifications?: ServerNotification[] };
			if (version !== app.notificationVersion || app.notificationMutations) return;
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
		const viewport = window.visualViewport;
		const updateViewportHeight = () => {
			if (!viewport || viewport.scale === 1) document.documentElement.style.setProperty('--app-height', `${viewport?.height ?? window.innerHeight}px`);
		};
		updateViewportHeight();
		viewport?.addEventListener('resize', updateViewportHeight);
		window.addEventListener('resize', updateViewportHeight);
		return () => {
			viewport?.removeEventListener('resize', updateViewportHeight);
			window.removeEventListener('resize', updateViewportHeight);
		};
	});
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

<svelte:window onpointerdown={closeNotificationsOutside} />
<NavigationProgress />

<svelte:head>
	<link rel="icon" href={logo} />
</svelte:head>

<div style:height="var(--app-height, 100dvh)" class="grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-neutral-950 font-sans text-neutral-200">
	<header
		class:editor-header={editorActive && !!page.params.img}
		class="z-50 flex items-center justify-between border-b border-neutral-800/50 bg-neutral-950/80 px-3 py-3 backdrop-blur-md sm:px-6"
	>
		<!-- Brand -->
		<a href="/" class="flex items-center gap-2 sm:gap-3">
			<img src={logo} alt="GiRAF Logo" class="h-8 w-8 rounded-full sm:h-9 sm:w-9" />
			<span class="hidden text-base font-bold tracking-tight text-neutral-100 uppercase sm:text-lg lg:block">
				Gi<span class="font-light text-neutral-500">RAF</span>
			</span>
		</a>

		<!-- Main Nav -->
		<FlowNav {triageEnabled} {sessionName} {sessionId} />

		<!-- Utilities -->
		<div class="relative flex items-center gap-2">
			<button
				type="button"
				bind:this={notificationsButton}
				class="relative flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-100 sm:h-9 sm:w-9"
				aria-label={notificationsAriaLabel}
				aria-expanded={showNotifications}
				onclick={toggleNotifications}
			>
				<IconBell size={20} />
				{#if totalRunningTasks > 0}
					<span class="absolute top-1 right-1 inline-flex h-3 w-3 items-center justify-center" aria-hidden="true">
						<span class="running-ring absolute inset-0 rounded-full border border-neutral-100/70"></span>
						<span class="running-dot h-1.5 w-1.5 rounded-full bg-neutral-100"></span>
					</span>
				{/if}
			</button>

			{#if showNotifications}
				<div
					bind:this={notificationsPanel}
					class="absolute top-11 right-0 z-80 w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/95 shadow-2xl backdrop-blur-md lg:right-10"
				>
					<div class="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
						<p class="text-xs font-semibold tracking-wider text-neutral-400 uppercase">Notifications</p>
						{#if app.notifications.length > 0}
							<button type="button" class="text-xs text-neutral-500 transition-colors hover:text-neutral-200" onclick={() => void app.clearNotifications()}> Clear </button>
						{/if}
					</div>

					<div class="max-h-72 overflow-y-auto">
						{#if uploads.isUploading}<div class="p-3"><UploadProgress /></div>{/if}
						{#if app.notifications.length === 0 && !uploads.isUploading}
							<p class="px-3 py-4 text-sm text-neutral-500">No notifications yet.</p>
						{:else}
							{#each app.notifications as notification (notification.id)}
								{@const typeColor = {
									success: 'bg-neutral-500',
									error: 'bg-neutral-500',
									info: 'bg-neutral-500'
								}[notification.type]}
								<div class="border-b border-neutral-800/70 px-3 py-2 last:border-b-0">
									<div class="flex items-start gap-2">
										<span class={`mt-1 h-2 w-2 shrink-0 rounded-full ${typeColor}`}></span>
										<div class="min-w-0 flex-1">
											<p class="text-xs font-semibold tracking-wide text-neutral-100 uppercase">{notification.type}</p>
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
	<main class="min-h-0">
		{@render children?.()}
	</main>
</div>

<!-- toasts: top of the screen so they never cover bottom action bars -->
<div
	bind:this={toastLayer}
	popover="manual"
	class="pointer-events-none fixed inset-x-3 top-16 bottom-auto z-80 m-0 flex h-auto w-auto flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-0 sm:inset-x-auto sm:right-4 sm:items-end"
	role="status"
	aria-live="polite"
>
	{#each app.toasts as toast (toast.id)}
		<div
			in:fly={{ y: -12, duration: 180 }}
			out:fade={{ duration: 120 }}
			class="pointer-events-auto relative flex w-full max-w-md items-center gap-3 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900/95 py-2 pr-2 pl-4 text-sm text-neutral-50 shadow-xl backdrop-blur-md sm:w-auto sm:min-w-72"
		>
			<span class="h-2 w-2 shrink-0 rounded-full {toast.type === 'error' ? 'bg-red-400' : toast.type === 'success' ? 'bg-emerald-400' : 'bg-neutral-400'}" aria-hidden="true"
			></span>
			<span class="min-w-0 flex-1 py-1 font-medium">{toast.message}</span>
			{#if toast.action}
				<button
					class="min-h-10 shrink-0 rounded-lg bg-neutral-100 px-3 font-semibold text-neutral-950 hover:bg-white"
					onclick={() => {
						toast.action?.run();
						app.removeToast(toast.id);
					}}>{toast.action.label}</button
				>
			{/if}
			<button
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
				aria-label="Dismiss"
				onclick={() => app.removeToast(toast.id)}>✕</button
			>
			<span class="toast-timer absolute inset-x-0 bottom-0 h-0.5 origin-left bg-neutral-500" style:animation-duration="{toast.duration}ms"></span>
		</div>
	{/each}
</div>

<style>
	.toast-timer {
		animation: toast-timer linear forwards;
	}
	@keyframes toast-timer {
		from {
			transform: scaleX(1);
		}
		to {
			transform: scaleX(0);
		}
	}
	@media (max-width: 1023px) {
		.editor-header > div > button {
			width: 44px;
			height: 44px;
		}
	}
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
