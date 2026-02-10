import {
	clearNotifications,
	getNotifications,
	markAllNotificationsRead
} from '$lib/server/notifications';
import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
	const notifications = await getNotifications();
	return json({ notifications });
};

export const PATCH: RequestHandler = async () => {
	const notifications = await markAllNotificationsRead();
	return json({ notifications });
};

export const DELETE: RequestHandler = async () => {
	await clearNotifications();
	return json({ status: 'ok' });
};
