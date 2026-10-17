import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The editor overview now lives in the gallery; keep old links and bookmarks working. */
export const GET: RequestHandler = () => redirect(308, '/gallery?view=recent');
