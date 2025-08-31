import type { SessionsResponse } from "../api/sessions/+server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch }) => {
    const req = await fetch('/api/sessions');
    return await req.json() as SessionsResponse;
};