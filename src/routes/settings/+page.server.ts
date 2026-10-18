import { getAllSettings, setSetting } from '$lib/server/db/settings';
import type { Actions, PageServerLoad } from './$types';
import { adjustmentCategories } from '$lib/adjustment-categories';
import { parseExportSettings } from '$lib/export-settings';
import { getExportSettings, saveExportSettings } from '$lib/server/export-settings';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
	const settings = await getAllSettings();
	return {
		settings,
		exportSettings: await getExportSettings()
	};
};

export const actions: Actions = {
	categories: async ({ request }) => {
		const formData = await request.formData();
		const visible = new Set(formData.getAll('visible_category'));
		await setSetting(
			'hidden_adjustment_categories',
			adjustmentCategories
				.filter((category) => !visible.has(category.id))
				.map((category) => category.id)
				.join(',')
		);
		return { success: true };
	},
	export: async ({ request }) => {
		const formData = await request.formData();
		const read = (name: string) => {
			const value = formData.get(name);
			return typeof value === 'string' ? value : null;
		};
		// An empty long edge means full size
		const raw = { quality: read('quality'), longEdge: read('long_edge')?.trim() || '0' };
		const settings = parseExportSettings(raw);
		// Parsing falls back to defaults, so compare to reject values the form never offers
		if (String(settings.quality) !== raw.quality || String(settings.longEdge) !== raw.longEdge) {
			return fail(400, { exportError: 'Invalid export settings.' });
		}
		await saveExportSettings(settings);
		return { success: true };
	},
	update: async ({ request }) => {
		const formData = await request.formData();
		const triageEnabled = formData.get('triage_enabled') === 'on';

		await setSetting('triage_enabled', triageEnabled ? 'true' : 'false');

		return { success: true };
	}
};
