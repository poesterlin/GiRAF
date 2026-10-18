import { getBooleanSetting, getSetting } from '$lib/server/db/settings';
import { hiddenAdjustmentCategories } from '$lib/adjustment-categories';
import { getNotifications } from '$lib/server/notifications';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const triageEnabled = await getBooleanSetting('triage_enabled', true);
	const notifications = await getNotifications();
	return {
		hiddenAdjustmentCategories: hiddenAdjustmentCategories(await getSetting('hidden_adjustment_categories', '')),
		triageEnabled,
		notifications
	};
};
