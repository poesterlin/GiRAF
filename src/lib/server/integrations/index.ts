import { GooglePhotosProvider } from "./google";
import { ImmichProvider } from "./immich";

export const integrations = [new ImmichProvider(), new GooglePhotosProvider()];
