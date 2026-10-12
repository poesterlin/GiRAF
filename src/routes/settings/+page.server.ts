import { getAllSettings, setSetting } from '$lib/server/db/settings';
import type { Actions, PageServerLoad } from './$types';
import { adjustmentCategories } from '$lib/adjustment-categories';

export const load: PageServerLoad = async () => {
    const settings = await getAllSettings();
    return {
        settings
    };
};

export const actions: Actions = {
    categories: async ({ request }) => {
        const formData = await request.formData();
        const visible = new Set(formData.getAll('visible_category'));
        await setSetting('hidden_adjustment_categories', adjustmentCategories.filter(category => !visible.has(category.id)).map(category => category.id).join(','));
        return { success: true };
    },
    update: async ({ request }) => {
        const formData = await request.formData();
        const triageEnabled = formData.get('triage_enabled') === 'on';
        
        await setSetting('triage_enabled', triageEnabled ? 'true' : 'false');
        
        return { success: true };
    }
};
