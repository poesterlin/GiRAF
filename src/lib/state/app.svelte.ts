interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
	action?: { label: string; run: () => void };
	duration: number;
	/** Repeats of the same event fold into one toast instead of stacking. */
	key?: string;
	count: number;
}

/** Repeats of a keyed toast keep counting instead of adding another. */
interface ToastOptions {
	key?: string;
	/** Message once more than one repeat has folded in. */
	countMessage?: (count: number) => string;
}

interface NotificationItem {
	id: string;
	message: string;
	type: 'success' | 'error' | 'info';
	createdAt: Date;
	read: boolean;
}

interface ServerNotificationItem {
	id: string;
	message: string;
	type: 'success' | 'error' | 'info';
	createdAt: string;
	read: boolean;
}

class AppState {
	notificationVersion = 0;
	notificationMutations = 0;
    toasts = $state<Toast[]>([]);
	private toastTimers = new Map<string, ReturnType<typeof setTimeout>>();
	notifications = $state<NotificationItem[]>([]);
	private notificationQueue: Promise<void> = Promise.resolve();

	private enqueueNotificationMutation(operation: () => Promise<void>) {
		this.notificationMutations += 1;
		const task = this.notificationQueue.catch(() => {}).then(async () => {
			try {
				await operation();
			} finally {
				this.notificationMutations -= 1;
				this.notificationVersion += 1;
			}
		});
		this.notificationQueue = task;
		return task;
	}

	private createId() {
		// crypto.randomUUID() is not available in all contexts
		return Math.random().toString(36).substring(2, 9);
	}

	setNotifications(notifications: NotificationItem[]) {
		this.notifications = notifications;
	}

    addToast(message: string, type: 'success' | 'error' | 'info', action?: Toast['action'], options?: ToastOptions) {
		// Errors and toasts with an action need longer to be read or acted on
		const duration = action ? 10000 : type === 'error' ? 6000 : 3500;
		// A repeat of a toast still on screen folds into it, so rapid actions read as one
		const index = options?.key ? this.toasts.findIndex((toast) => toast.key === options.key) : -1;
		if (index !== -1) {
			const existing = this.toasts[index];
			const previous = existing.action;
			const merged: Toast = {
				...existing,
				count: existing.count + 1,
				message: options?.countMessage?.(existing.count + 1) ?? message,
				duration,
				action: action ? (previous ? { label: action.label, run: () => { previous.run(); action.run(); } } : action) : previous
			};
			this.toasts = this.toasts.map((toast, position) => (position === index ? merged : toast));
			this.scheduleRemoval(merged);
			return merged.id;
		}
        const id = this.createId();
		const toast: Toast = { id, message, type, action, duration, key: options?.key, count: 1 };
		this.toasts = [...this.toasts, toast].slice(-3);
        this.scheduleRemoval(toast);
		return id;
    }

	private scheduleRemoval(toast: Toast) {
		const timer = this.toastTimers.get(toast.id);
		if (timer) clearTimeout(timer);
		this.toastTimers.set(toast.id, setTimeout(() => this.removeToast(toast.id), toast.duration));
	}

	removeToast(id: string) {
		const timer = this.toastTimers.get(id);
		if (timer) clearTimeout(timer);
		this.toastTimers.delete(id);
		this.toasts = this.toasts.filter((item) => item.id !== id);
	}

	async markAllNotificationsRead() {
		const version = ++this.notificationVersion;
		this.notifications = this.notifications.map((notification) => ({
			...notification,
			read: true
		}));
		return this.enqueueNotificationMutation(async () => {
			try {
				const response = await fetch('/api/notifications', { method: 'PATCH' });
				if (!response.ok) {
					return;
				}
				const payload = (await response.json()) as { notifications?: ServerNotificationItem[] };
				if (version !== this.notificationVersion) return;
				if (!Array.isArray(payload.notifications)) {
					return;
				}
				this.notifications = payload.notifications.map((notification) => ({
					...notification,
					createdAt: new Date(notification.createdAt)
				}));
			} catch {
				// Keep local state even if request fails.
			}
		});
	}

	async clearNotifications() {
		this.notificationVersion += 1;
		this.notifications = [];
		return this.enqueueNotificationMutation(async () => {
			try {
				await fetch('/api/notifications', { method: 'DELETE' });
			} catch {
				// Keep local state even if request fails.
			}
		});
	}
}

export const app = new AppState();
