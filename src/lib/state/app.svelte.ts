interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
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
    toasts = $state<Toast[]>([]);
	notifications = $state<NotificationItem[]>([]);

	private createId() {
		// crypto.randomUUID() is not available in all contexts
		return Math.random().toString(36).substring(2, 9);
	}

	setNotifications(notifications: NotificationItem[]) {
		this.notifications = notifications;
	}

    addToast(message: string, type: 'success' | 'error' | 'info') {
        const id = this.createId();
        const toast = { id, message, type };
		this.toasts.push(toast);

        setTimeout(() => {
			this.toasts = this.toasts.filter((item) => item.id !== id);
        }, 3000);
    }

	async markAllNotificationsRead() {
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
		this.notifications = [];
		try {
			await fetch('/api/notifications', { method: 'DELETE' });
		} catch {
			// Keep local state even if request fails.
		}
	}
}

export const app = new AppState();
