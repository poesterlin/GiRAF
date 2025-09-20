import { db } from "$lib/server/db";
import { imageTable, sessionTable, snapshotTable } from "$lib/server/db/schema";
import { desc, eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { applyPP3Diff, parsePP3, stringifyPP3 } from "$lib/pp3-utils";
import ExportPP3 from '$lib/assets/export.pp3?raw';
import { mkdirPath } from "$lib/server/jobs/executor";
import { assert } from "$lib";
import { env } from "$env/dynamic/private";
import { editImage, setWhiteBalance } from "$lib/server/image-editor";
import { join } from "path";
import { respondWithFile } from "$lib/server/utils";

export const GET: RequestHandler = async ({ params }) => {
    const id = Number(params.id);
    const image = await db.query.imageTable.findFirst({
        where: eq(imageTable.id, id)
    });

    if (!image) {
        error(404, "Image not found");
    }

    if (image.isArchived) {
        console.log(`[Executor] Skipping archived image: ${image.id}`);

        return new Response();
    }

    const session = await db.query.sessionTable.findFirst({
        where: eq(sessionTable.id, image.sessionId)
    });

    assert(session, 'Session not found');

    const edit = await db.query.snapshotTable.findFirst({
        where: eq(snapshotTable.imageId, image.id),
        orderBy: desc(snapshotTable.createdAt)
    });

    const pp3 = setWhiteBalance(parsePP3(edit?.pp3 ?? ''), image.whiteBalance, image.tint);
    const merged = applyPP3Diff(pp3, parsePP3(ExportPP3));

    console.log(`[Executor] Processing ${image.filepath}`);
    assert(env.TMP_DIR, 'TMP_DIR not set in env');
    const outputPath = join(env.TMP_DIR, `${id}.jpg`);
    await mkdirPath(outputPath);
    await editImage(image.filepath, stringifyPP3(merged), { outputPath, recordedAt: image.recordedAt });

    return respondWithFile(outputPath);
};