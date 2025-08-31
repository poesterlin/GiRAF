import type { RequestHandler } from "./$types";

export interface ImageDetails {
    id: number;
    name: string;
    resolutionX: string;
    resolutionY: string;
    rating: number;
    date: string;
    iso: number;
    aperture: number;
    exposure: number;
    focalLength: number;
    camera: string;
    lens: string;
    whiteBalance: string;
    tint: number;
}

export const GET: RequestHandler = async () => {

    return new Response();
};