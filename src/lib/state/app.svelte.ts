interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
	action?: { label: string; run: () => void };
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
    toasts = $state<Toast[]>([]);
	notifications = $state<NotificationItem[]>([]);

	private createId() {
		// crypto.randomUUID() is not available in all contexts
		return Math.random().toString(36).substring(2, 9);
	}

	setNotifications(notifications: NotificationItem[]) {
		this.notifications = notifications;
	}

    addToast(message: string, type: 'success' | 'error' | 'info', action?: Toast['action']) {
        const id = this.createId();
        const toast = { id, message, type, action };
		this.toasts.push(toast);

        setTimeout(() => {
			this.toasts = this.toasts.filter((item) => item.id !== id);
        }, action ? 10000 : 3000);
    }

	async markAllNotificationsRead() {
		const version = ++this.notificationVersion;
		this.notifications = this.notifications.map((notification) => ({
			...notification,
			read: true
		}));
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
	}

	async clearNotifications() {
		this.notificationVersion += 1;
		this.notifications = [];
		try {
			await fetch('/api/notifications', { method: 'DELETE' });
		} catch {
			// Keep local state even if request fails.
		}
	}
}

export const app = new AppState();
