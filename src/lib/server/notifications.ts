import { getSetting, setSetting } from '$lib/server/db/settings';

export type NotificationType = 'success' | 'error' | 'info';

export interface ServerNotification {
	id: string;
	message: string;
	type: NotificationType;
	createdAt: string;
	read: boolean;
}

const NOTIFICATIONS_KEY = 'notifications_v1';
const MAX_NOTIFICATIONS = 100;

function createId() {
	return crypto.randomUUID();
}

function parseNotifications(value: string): ServerNotification[] {
	try {
		const parsed = JSON.parse(value) as ServerNotification[];
		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed.filter(
			(item) =>
				Boolean(item?.id) &&
				Boolean(item?.message) &&
				(item?.type === 'success' || item?.type === 'error' || item?.type === 'info') &&
				Boolean(item?.createdAt) &&
				typeof item?.read === 'boolean'
		);
	} catch {
		return [];
	}
}

async function saveNotifications(notifications: ServerNotification[]) {
	await setSetting(NOTIFICATIONS_KEY, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
}

export async function getNotifications(): Promise<ServerNotification[]> {
	const raw = await getSetting(NOTIFICATIONS_KEY, '[]');
	return parseNotifications(raw);
}

export async function appendNotification(message: string, type: NotificationType): Promise<ServerNotification> {
	const notifications = await getNotifications();
	const notification: ServerNotification = {
		id: createId(),
		message,
		type,
		createdAt: new Date().toISOString(),
		read: false
	};
	await saveNotifications([notification, ...notifications]);
	return notification;
}

export async function markAllNotificationsRead(): Promise<ServerNotification[]> {
	const notifications = await getNotifications();
	const next = notifications.map((notification) => ({ ...notification, read: true }));
	await saveNotifications(next);
	return next;
}

export async function clearNotifications() {
	await saveNotifications([]);
}
