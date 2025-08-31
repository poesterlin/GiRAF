import { env } from "$env/dynamic/private";
import { assert } from "$lib";
import ImportPP3 from "$lib/assets/import.pp3?raw";
import { editImage } from "$lib/server/image-editor";
import type { RequestHandler } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { join } from "path";


export const GET: RequestHandler = async ({ url }) => {
    try {
        // TODO: get proper image
        assert(env.IMG_DIR, "IMG_DIR environment variable is not set");
        const path = join(env.IMG_DIR, "example.RAF");

        const output = await editImage(path, ImportPP3, true, 16);

        return new Response(output);
    } catch (err) {
        console.error("Error editing image:", err);
        error(400, {
            message: "Failed to edit image",

        });
    }
};