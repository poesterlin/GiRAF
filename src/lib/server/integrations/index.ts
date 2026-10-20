import type { PhotoIntegration } from './types';
import { GooglePhotosProvider } from './google';
import { ImmichProvider } from './immich';

export const integrations: PhotoIntegration[] = [new ImmichProvider(), new GooglePhotosProvider()];
