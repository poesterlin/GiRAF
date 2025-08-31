import type { ExporterSessionsResponse } from '../api/exporter/sessions/+server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	const req = await fetch('/api/exporter/sessions');
	const data: ExporterSessionsResponse = await req.json();
	return data;
};
