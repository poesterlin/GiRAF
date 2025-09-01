import { db } from "$lib/server/db";
import { importTable } from "$lib/server/db/schema";
import { respondWithFile } from "$lib/server/utils";
import { error, redirect, type RequestHandler } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { exiftool } from "exiftool-vendored";

export const GET: RequestHandler = async ({ params }) => {
    const id = Number(params.id);

    const importFile = await db.query.importTable.findFirst({
        where: eq(importTable.id, id)
    });

    if (!importFile) {
        error(404, "Import file not found");
    }

    if (importFile.previewPath && await Bun.file(importFile.previewPath).exists()) {
        return respondWithFile(importFile.previewPath);
    }

    const tempFile = "/tmp/" + importFile.id + "_thumbnail.jpg";
    try {
        const startTime = performance.now();
        await exiftool.extractThumbnail(importFile.filePath, tempFile, { ignoreMinorErrors: true, forceWrite: true });

        await db.update(importTable).set({ previewPath: tempFile }).where(eq(importTable.id, importFile.id));

        const endTime = performance.now();
        console.log(`Thumbnail extracted in ${endTime - startTime}ms`);

        return respondWithFile(tempFile);
    } catch (err) {
        console.error("Error extracting thumbnail:", err);
        redirect(302, "/error-thumbnail.jpg");
    }
};
