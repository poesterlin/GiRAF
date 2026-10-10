import { analyzeTiffExposure } from './auto-exposure';

try {
	if (!process.argv[2]) throw new Error('Usage: bun scripts/resolve-auto-exposure.ts <TIFF>');
	console.log(JSON.stringify(await analyzeTiffExposure(process.argv[2])));
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
