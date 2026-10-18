import { db } from "$lib/server/db";
import { sessionTable } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { stringifyPP3 } from "$lib/pp3-utils";
import { ensureDir } from "$lib/server/jobs/executor";
import { assert } from "$lib";
import { env } from "$env/dynamic/private";
import { editImage, mapCropFromPreviewToExport } from "$lib/server/image-editor";
import { acquireDevelopBase } from "$lib/server/develop-cache";
import { findImage, loadEditPP3 } from "$lib/server/image-records";
import { join } from "path";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";

export const GET: RequestHandler = async ({ params }) => {
    const id = Number(params.id);
    const image = await findImage(id);

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

    const pp3 = await loadEditPP3(image);

    console.log(`[Render] Processing ${image.filepath}`);
    assert(env.TMP_DIR, 'TMP_DIR not set in env');
    const outputPath = join(env.TMP_DIR, `${id}-${randomUUID()}.jpg`);
    await ensureDir(outputPath);
    // Two-step pipeline: RAW → cached full-res develop base (intermediate representation) → JPEG.
    // Repeat renders reuse the base, skipping RAW decode and demosaicing.
    const base = await acquireDevelopBase(image.filepath, { previewTif: image.tifPath });
    try {
        const mappedPP3 = await mapCropFromPreviewToExport(pp3, image.tifPath, base.path);
        await editImage(base.path, stringifyPP3(mappedPP3), { outputPath, recordedAt: image.recordedAt });
    } finally {
        base.release();
    }

    try {
        const jpeg = await Bun.file(outputPath).arrayBuffer();
        return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(jpeg.byteLength), 'Cache-Control': 'public, max-age=0' } });
    } finally {
        await rm(outputPath, { force: true });
    }
};
