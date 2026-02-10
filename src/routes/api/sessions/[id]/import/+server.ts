import { db } from "$lib/server/db";
import { imageTable } from "$lib/server/db/schema";
import { jobManager } from "$lib/server/jobs/manager";
import { JobType } from "$lib/server/jobs/types";
import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";

export const GET: RequestHandler = async ({ params }) => {
    const sessionId = Number(params.id);
    if (isNaN(sessionId)) {
        return json({ message: 'Invalid session ID' }, { status: 400 });
    }

    const state = jobManager.getJobState(sessionId, JobType.IMPORT);
    return json(state);
};

export const POST: RequestHandler = async ({ params }) => {
    const sessionId = Number(params.id);
    if (isNaN(sessionId)) {
        return json({ message: 'Invalid session ID' }, { status: 400 });
    }

    const images = await db.query.imageTable.findMany({
        where: eq(imageTable.sessionId, sessionId),
        columns: {
            filepath: true
        }
    });

    if (images.length === 0) {
        return json({ message: 'No images found for this session' }, { status: 404 });
    }

    const submitted = jobManager.submit(JobType.IMPORT, { sessionId });
    if (!submitted) {
        return json({ message: 'An import job is already running for this session' }, { status: 409 });
    }

    return json({ status: 'ok' }, { status: 202 });
};

export const DELETE: RequestHandler = async ({ params }) => {
    const { id } = params;
    jobManager.cancel(Number(id));
    return json({ status: 'ok' });
};
