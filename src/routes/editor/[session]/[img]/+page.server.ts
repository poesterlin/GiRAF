import { Glob } from "bun";
import type { PageServerLoad } from "./$types";
import { join } from "node:path";
import { env } from "node:process";

export const load: PageServerLoad = async () => {
    const glob = new Glob("**/*.png");

    // TODO: load from environment variable
    const cwd = env.CLUT_DIR || "/app/cluts";
    const files = await Array.fromAsync(glob.scan({ cwd }));
    const luts = files.map((f) => formatLut(f, cwd));

    return { luts, image: { id: "1234" } };
};

function formatLut(path: string, cwd: string) {
    const folders = path.split('/');
    const name = folders.pop()?.replace(/\.png$/, "");

    return { name: name ?? "Lut", path: join(cwd, path), tags: folders };
}