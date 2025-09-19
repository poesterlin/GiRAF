import { db } from "$lib/server/db";
import { importTable } from "$lib/server/db/schema";
import { respondWithFile } from "$lib/server/utils";
import { error, redirect, type RequestHandler } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { exiftool } from "exiftool-vendored";
import sharp from "sharp";

export const GET: RequestHandler = async ({ params }) => {
    const id = Number(params.id);

    const importFile = await db.query.importTable.findFirst({
        where: eq(importTable.id, id)
    });

    if (!importFile) {
        error(404, "Import file not found");
    }

    const importExists = await Bun.file(importFile.filePath).exists();
    if (!importExists) {
        redirect(302, "/error-thumbnail.jpg");
    }

    if (importFile.previewPath && await Bun.file(importFile.previewPath).exists()) {
        return respondWithFile(importFile.previewPath);
    }

    const tempFile = "/tmp/" + importFile.id + "_thumbnail.jpg";
    const compressedFile = "/tmp/" + importFile.id + "_thumbnail_compressed.jpg";
    try {
        const startTime = performance.now();
        await exiftool.extractThumbnail(importFile.filePath, tempFile, { ignoreMinorErrors: true, forceWrite: true });

        await sharp(tempFile)
            .resize({ width: 300 })
            .jpeg({ quality: 80 })
            .toFile(compressedFile);

        await db.update(importTable).set({ previewPath: compressedFile }).where(eq(importTable.id, importFile.id));

        const endTime = performance.now();
        console.log(`Thumbnail extracted and compressed in ${endTime - startTime}ms`);

        return respondWithFile(compressedFile);
    } catch (err) {
        console.error("Error extracting thumbnail:", err);
        redirect(302, "/error-thumbnail.jpg");
    }
};
