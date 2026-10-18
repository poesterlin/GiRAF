import { json } from '@sveltejs/kit';

/** Lets container health checks see the server is up without logging in or rendering a page. */
export const GET = () => json({ ok: true });
