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

/**
 * Every notification lives in one JSON row, so a read-then-write must not overlap another one.
 * Two jobs finishing at the same moment would otherwise each read the same list and the second
 * write would drop the first notification. Work is queued instead.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function queued<T>(work: () => Promise<T>): Promise<T> {
	const run = writeQueue.then(work, work);
	writeQueue = run.catch(() => {});
	return run;
}

export async function getNotifications(): Promise<ServerNotification[]> {
	const raw = await getSetting(NOTIFICATIONS_KEY, '[]');
	return parseNotifications(raw);
}

export function appendNotification(message: string, type: NotificationType): Promise<ServerNotification> {
	return queued(async () => {
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
	});
}

export function markAllNotificationsRead(): Promise<ServerNotification[]> {
	return queued(async () => {
		const notifications = await getNotifications();
		const next = notifications.map((notification) => ({ ...notification, read: true }));
		await saveNotifications(next);
		return next;
	});
}

export function clearNotifications() {
	return queued(async () => {
		await saveNotifications([]);
	});
}
