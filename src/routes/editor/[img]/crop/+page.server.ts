import { loadEditorImage } from '$lib/server/editor-data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => loadEditorImage(Number(params.img));
