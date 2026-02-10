import { getBooleanSetting } from '$lib/server/db/settings';
import { getNotifications } from '$lib/server/notifications';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
    const triageEnabled = await getBooleanSetting('triage_enabled', true);
    const notifications = await getNotifications();
    return {
        triageEnabled,
		notifications
    };
};
