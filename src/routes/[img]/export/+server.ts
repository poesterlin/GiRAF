import { env } from "$env/dynamic/private";
import { assert } from "$lib";
import BasePP3 from "$lib/assets/base.pp3?raw";
import ClientPP3 from "$lib/assets/client.pp3?raw";
import ExportPP3 from "$lib/assets/export.pp3?raw";
import { applyPP3Diff, fromBase64, parsePP3, stringifyPP3 } from "$lib/pp3-utils";
import { editImage } from "$lib/server/image-editor";
import { respondWithFile } from "$lib/server/utils";
import type { RequestHandler } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { join } from "path";

const ExportPP3Config = applyPP3Diff(parsePP3(BasePP3), parsePP3(ExportPP3));

export const GET: RequestHandler = async ({ url }) => {
    try {
        const config = url.searchParams.get("config");

        // TODO: get proper image
        assert(env.IMG_DIR, "IMG_DIR environment variable is not set");
        const path = join(env.IMG_DIR, "example.RAF");

        const pp3String = config ? fromBase64(config) : ClientPP3;
        const pp3 = parsePP3(pp3String);
        const merged = applyPP3Diff(ExportPP3Config, pp3);

        const output = await editImage(path, stringifyPP3(merged));
        return respondWithFile(output);
    } catch (err) {
        console.error("Error editing image:", err);
        error(400, {
            message: "Failed to edit image",

        });
    }
};