import { env } from "$env/dynamic/private";
import { assert } from "$lib";
import BasePP3 from "$lib/assets/base.pp3?raw";
import ClientPP3 from "$lib/assets/client.pp3?raw";
import ExampleImg from "$lib/assets/example.jpg";
import { applyPP3Diff, fromBase64, parsePP3, stringifyPP3 } from "$lib/pp3-utils";
import { editImage } from "$lib/server/image-editor";
import { respondWithFile } from "$lib/server/utils";
import type { RequestHandler } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { join } from "path";

const ParsedBasePP3 = parsePP3(BasePP3);

export const GET: RequestHandler = async ({ url }) => {
    try {
        const config = url.searchParams.get("config");
        const isPreview = url.searchParams.has("preview");

        // TODO: get proper image
        assert(env.IMG_DIR, "IMG_DIR environment variable is not set");
        const path = join(env.IMG_DIR, "edited.tif"); // join(process.cwd(), ExampleImg);

        const pp3String = config ? fromBase64(config) : ClientPP3;
        const pp3 = parsePP3(pp3String);
        const merged = applyPP3Diff(ParsedBasePP3, pp3);

        const output = await editImage(path, stringifyPP3(merged), isPreview);
        return respondWithFile(output);
    } catch (err) {
        console.error("Error editing image:", err);
        error(400, {
            message: "Failed to edit image",
            
        });
    }
};