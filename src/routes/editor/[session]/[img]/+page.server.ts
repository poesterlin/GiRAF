import { Glob } from "bun";
import type { PageServerLoad } from "./$types";
import { join } from "node:path";
import { env } from "node:process";
import { error } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { eq } from "drizzle-orm";
import { imageTable } from "$lib/server/db/schema";

export const load: PageServerLoad = async ({ params }) => {
    const { session, img } = params;

    const image = await db.query.imageTable.findFirst({
        where: eq(imageTable.id, Number(img))
    });

    if (!image) {
        error(404, { message: "Image not found" });
    }

    // load luts
    const glob = new Glob("**/*.png");
    const cwd = env.CLUT_DIR;
    if (!cwd) {
        error(500, { message: "CLUT_DIR environment variable is not set" });
    }

    const files = await Array.fromAsync(glob.scan({ cwd }));
    const luts = files.map((f) => formatLut(f, cwd));

    return { luts, image };
};

function formatLut(path: string, cwd: string) {
    const folders = path.split('/');
    const name = folders.pop()?.replace(/\.png$/, "");

    return { name: name ?? "Lut", path: join(cwd, path), tags: folders };
}