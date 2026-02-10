import { jobManager } from "$lib/server/jobs/manager";
import { JobType } from "$lib/server/jobs/types";
import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ params }) => {
    const sessionId = Number(params.id);
    if (isNaN(sessionId)) {
        return json({ message: 'Invalid session ID' }, { status: 400 });
    }

    const state = jobManager.getJobState(sessionId, JobType.EXPORT);
    return json(state);
};

export const POST: RequestHandler = async ({ params }) => {
    const sessionId = Number(params.id);
    if (isNaN(sessionId)) {
        return json({ message: 'Invalid session ID' }, { status: 400 });
    }

    const submitted = jobManager.submit(JobType.EXPORT, { sessionId });
    if (!submitted) {
        return json({ message: 'An export job is already running for this session' }, { status: 409 });
    }

    return json({ status: 'ok' }, { status: 202 });
};

export const DELETE: RequestHandler = async ({ params }) => {
    const { id } = params;
    jobManager.cancel(Number(id));
    return json({ status: 'ok' });
};
