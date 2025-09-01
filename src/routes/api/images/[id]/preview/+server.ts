import { db } from "$lib/server/db";
import { imageTable, importTable } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "../$types";
import { error, redirect } from "@sveltejs/kit";
import { respondWithFile } from "$lib/server/utils";
import { exiftool } from "exiftool-vendored";

export const GET: RequestHandler = async ({params}) => {
    const id = Number(params.id);

    const image = await db.query.imageTable.findFirst({
        where: eq(imageTable.id, id)
    });

    if (!image) {
        error(404, "Import file not found");
    }

    if (image.previewPath && await Bun.file(image.previewPath).exists()) {
        return respondWithFile(image.previewPath);
    }

    const tempFile = "/tmp/" + image.id + "_preview.jpg";
    try {
        const startTime = performance.now();
        await exiftool.extractThumbnail(image.filepath, tempFile, { ignoreMinorErrors: true, forceWrite: true });

        await db.update(importTable).set({ previewPath: tempFile }).where(eq(importTable.id, image.id));

        const endTime = performance.now();
        console.log(`Thumbnail extracted in ${endTime - startTime}ms`);

        return respondWithFile(tempFile);
    } catch (err) {
        console.error("Error extracting thumbnail:", err);
    }

    redirect(302, "/error-thumbnail.jpg");
};