import { expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { stringifyPP3 } from './pp3-utils';
import { mapSpotRemovalToTarget, writeSpotRemoval } from './spot-removal';

// Opt-in integration check using an existing RT container, without rebuilding or
// deploying: SPOT_TEST_CONTAINER=raw-editor-editor-1 bun test src/lib/spot-removal.native.test.ts
const container = process.env.SPOT_TEST_CONTAINER;
const exec = promisify(execFile);

test.skipIf(!container)(
	'native RT clones in coarse-rotated space before crop at preview and export sizes',
	async () => {
		const local = await mkdtemp(join(tmpdir(), 'giraf-spot-'));
		const remote = `/tmp/${local.split('/').at(-1)}`;
		const docker = (...args: string[]) => exec('docker', args, { maxBuffer: 1024 * 1024 });
		try {
			await docker('exec', container!, 'mkdir', '-p', remote);
			const pp3 = writeSpotRemoval(
				{
					Coarse_Transformation: { Rotate: 90, HorizontalFlip: false, VerticalFlip: false },
					Crop: { Enabled: true, X: 20, Y: 60, W: 80, H: 80 },
					Exposure: { Auto: false, Compensation: 0 }
				},
				{
					enabled: true,
					entries: [{ source: { x: 89, y: 30 }, target: { x: 49, y: 110 }, radius: 8, feather: 0, opacity: 1 }]
				}
			);
			for (const scale of [1, 2]) {
				const width = 160 * scale;
				const height = 120 * scale;
				const pixels = Buffer.alloc(width * height * 3, 30);
				// White source patch becomes (89,30) after RT's clockwise coarse turn.
				for (let y = 15 * scale; y < 46 * scale; y++) {
					for (let x = 15 * scale; x < 46 * scale; x++) {
						pixels.fill(240, (y * width + x) * 3, (y * width + x) * 3 + 3);
					}
				}
				await sharp(pixels, { raw: { width, height, channels: 3 } })
					.tiff({ compression: 'none' })
					.toFile(join(local, 'input.tif'));
				await docker('cp', join(local, 'input.tif'), `${container}:${remote}/input.tif`);
				const mapped = mapSpotRemovalToTarget(pp3, 160, 120, width, height);
				mapped.Crop = { Enabled: true, X: 20 * scale, Y: 60 * scale, W: 80 * scale, H: 80 * scale };
				const results: Buffer[] = [];
				for (const enabled of [false, true]) {
					const profile = { ...mapped, Spot_removal: { ...mapped.Spot_removal, Enabled: enabled } };
					await Bun.write(join(local, 'edit.pp3'), stringifyPP3(profile));
					await docker('cp', join(local, 'edit.pp3'), `${container}:${remote}/edit.pp3`);
					await docker(
						'exec',
						'-e',
						'OMP_NUM_THREADS=2',
						container!,
						'rawtherapee-cli',
						'-q',
						'-p',
						`${remote}/edit.pp3`,
						'-o',
						`${remote}/output.png`,
						'-n',
						'-b8',
						'-Y',
						'-c',
						`${remote}/input.tif`
					);
					await docker('cp', `${container}:${remote}/output.png`, join(local, 'output.png'));
					const { data, info } = await sharp(join(local, 'output.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
					expect(info.width).toBe(80 * scale);
					expect(info.height).toBe(80 * scale);
					results.push(data);
				}
				const targetIndex = (50 * scale * (80 * scale) + 29 * scale) * 3;
				expect(results[1][targetIndex] - results[0][targetIndex]).toBeGreaterThan(100);
				// Distant pixels must not change: catches a globally altered render.
				expect(Math.abs(results[1][0] - results[0][0])).toBeLessThanOrEqual(1);
			}
		} finally {
			await docker('exec', container!, 'rm', '-rf', remote);
			await rm(local, { recursive: true, force: true });
		}
	},
	120_000
);
