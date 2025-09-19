import { db } from "$lib/server/db";
import { imageTable } from "$lib/server/db/schema";
import { and, eq, gt } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ params }) => {
    const id = Number(params.id);

    const image = await db.query.imageTable.findFirst({
        where: eq(imageTable.id, id)
    });

    if (!image) {
        return json({ error: "Image not found" }, { status: 404 });
    }

    await db.update(imageTable).set({ isArchived: true }).where(eq(imageTable.id, id));

    // find next image in line
    const [nextImage] = await db
        .select({ id: imageTable.id })
        .from(imageTable)
        .where(and(eq(imageTable.isArchived, false), gt(imageTable.recordedAt, image.recordedAt), eq(imageTable.sessionId, image.sessionId)))
        .orderBy(imageTable.id)
        .limit(1);

    return json({ next: nextImage?.id });
};

export const DELETE: RequestHandler = async ({ params }) => {
    const id = Number(params.id);

    const image = await db.query.imageTable.findFirst({
        where: eq(imageTable.id, id)
    });

    if (!image) {
        return json({ error: "Image not found" }, { status: 404 });
    }

    await db.update(imageTable).set({ isArchived: false }).where(eq(imageTable.id, id));

    return new Response();
};