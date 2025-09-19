import { db } from "$lib/server/db";
import { imageTable } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { error, redirect } from "@sveltejs/kit";
import { respondWithFile } from "$lib/server/utils";
import { exiftool } from "exiftool-vendored";
import { createTempDir } from "$lib/server/command-runner";
import { join } from "path";
import sharp from "sharp";

const rotations: Record<number, number> = {
    1: 0,
    3: 180,
    6: 90,
    8: 270
};

export const GET: RequestHandler = async ({ params }) => {
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

    if (!await Bun.file(image.filepath).exists()) {
        redirect(302, "/error-thumbnail.jpg");
    }

    const path = await createTempDir("thumbnails");
    const tempFile = join(path, image.id + "_preview.jpg");
    const compressedFile = join(path, image.id + "_preview_compressed.webp");

    try {
        const tags = await exiftool.read(image.filepath);
        const rotation = tags.Orientation ?? 1;

        const startTime = performance.now();
        await exiftool.extractThumbnail(image.filepath, tempFile, { ignoreMinorErrors: true, forceWrite: true });

        await sharp(tempFile)
            .resize({ width: 400, height: 300, fit: "contain" })
            .rotate(rotations[rotation])
            .webp({ quality: 80 })
            .toFile(compressedFile);

        Bun.file(tempFile).delete();

        await db.update(imageTable).set({ previewPath: compressedFile }).where(eq(imageTable.id, image.id));

        const endTime = performance.now();
        console.log(`Thumbnail extracted and compressed in ${endTime - startTime}ms`);

        return respondWithFile(compressedFile);
    } catch (err) {
        console.error("Error extracting thumbnail:", err);
    }

    redirect(302, "/error-thumbnail.jpg");
};