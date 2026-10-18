import { getBooleanSetting } from '$lib/server/db/settings';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const triageEnabled = await getBooleanSetting('triage_enabled', true);
	if (!triageEnabled) {
		throw redirect(302, '/gallery');
	}
};
