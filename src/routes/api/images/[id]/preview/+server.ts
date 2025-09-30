import { db } from "$lib/server/db";
import { imageTable } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "./$types";
import { error, redirect } from "@sveltejs/kit";
import { exiftool } from "exiftool-vendored";
import { createTempDir } from "$lib/server/command-runner";
import { join } from "path";
import sharp, { type FitEnum } from "sharp";

const rotations: Record<number, number> = {
    1: 0,
    3: 180,
    6: 90,
    8: 270
};

export const GET: RequestHandler = async ({ params, url }) => {
    const id = Number(params.id);
    const size = Math.min(Number(url.searchParams.get("size") || 400), 2000);
    const mode: keyof FitEnum = url.searchParams.get("mode") || "contain" as any;

    const image = await db.query.imageTable.findFirst({
        where: eq(imageTable.id, id)
    });

    if (!image) {
        error(404, "Import file not found");
    }

    if (image.previewPath && await Bun.file(image.previewPath).exists()) {
        const buffer = await sharp(image.previewPath)
            .resize({ width: size, height: size, fit: mode, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();

        return new Response(buffer as any, {
            headers: {
                'Content-Type': 'image/webp',
                'Content-Length': String(buffer.length),
                'Cache-Control': `public, max-age=${31536000}`
            },
        });
    }

    if (!await Bun.file(image.filepath).exists()) {
        redirect(302, "/error-thumbnail.jpg");
    }

    const path = await createTempDir("thumbnails");
    const tempFile = join(path, image.id + "_preview.jpg");
    const compressedFile = join(path, image.id + "_preview_rotated.jpg");

    try {
        const tags = await exiftool.read(image.filepath);
        const rotation = tags.Orientation ?? 1;

        const startTime = performance.now();
        await exiftool.extractPreview(image.filepath, tempFile, { ignoreMinorErrors: true, forceWrite: true });

        await sharp(tempFile)
            .resize({ width: 2000, height: 2000, fit: 'contain', withoutEnlargement: true })
            .rotate(rotations[rotation])
            .jpeg({ quality: 95 })
            .toFile(compressedFile);

        Bun.file(tempFile).delete().catch(() => { /* ignore */ });

        await db.update(imageTable).set({ previewPath: compressedFile }).where(eq(imageTable.id, image.id));

        const endTime = performance.now();
        console.log(`Thumbnail extracted and compressed in ${endTime - startTime}ms`);

        const buffer = await sharp(compressedFile)
            .resize({ width: size, height: size, fit: mode })
            .webp({ quality: 85 })
            .toBuffer();

        return new Response(buffer as any, {
            headers: {
                'Content-Type': 'image/webp',
                'Content-Length': String(buffer.length),
                'Cache-Control': `public, max-age=${31536000}`
            },
        });
    } catch (err) {
        console.error("Error extracting thumbnail:", err);
    }

    redirect(302, "/error-thumbnail.jpg");
};