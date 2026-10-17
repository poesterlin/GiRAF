import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { sessionTable } from "$lib/server/db/schema";
import { db } from "$lib/server/db";
import { eq } from "drizzle-orm";

export const POST: RequestHandler = async ({ params }) => {
    const sessionId = Number(params.id);
    if (isNaN(sessionId)) {
        return json({ message: 'Invalid session ID' }, { status: 400 });
    }

    await db.update(sessionTable).set({ isArchived: true }).where(eq(sessionTable.id, sessionId));
    return json({ status: 'ok' });
};

/** Restores an archived session to the gallery. */
export const DELETE: RequestHandler = async ({ params }) => {
    const sessionId = Number(params.id);
    if (isNaN(sessionId)) {
        return json({ message: 'Invalid session ID' }, { status: 400 });
    }

    const restored = await db.update(sessionTable).set({ isArchived: false }).where(eq(sessionTable.id, sessionId)).returning({ id: sessionTable.id });
    if (!restored.length) return json({ message: 'Session not found' }, { status: 404 });
    return json({ status: 'ok' });
};
