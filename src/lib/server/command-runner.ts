import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { availableParallelism, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { env } from '$env/dynamic/private';

export async function createTempDir(prefix: string) {
	const TMP_DIR = env.TMP_DIR || tmpdir();
	const path = join(TMP_DIR, `${prefix}`);

	try {
		await mkdir(path, { recursive: true });
	} catch {
		/* ignore */
	}

	return path;
}

/**
 * What a render is for, most urgent first. The small editor preview is what a user waits on while
 * dragging a slider, so it beats the detailed refinement, which beats thumbnail tiles (film looks,
 * versions), which beat imports, exports and other background work.
 */
export type RenderPriority = 'quick' | 'final' | 'thumbnail' | 'background';

const RANK: Record<RenderPriority, number> = { quick: 0, final: 1, thumbnail: 2, background: 3 };

/** Lower CPU priority for work nobody is actively waiting on, so the OS hands the cores to previews. */
const NICENESS: Partial<Record<RenderPriority, number>> = { thumbnail: 10, background: 19 };

/** Slots only quick previews may use, so one never waits for a slow render that is already running. */
const QUICK_RESERVE = 1;

type Waiter = { start: () => void; priority: RenderPriority };

/**
 * Caps how many RawTherapee processes run at once. Each one already uses every core, so a grid of
 * film-look thumbnails would otherwise start dozens and starve the preview the user is waiting for.
 * Waiters start in priority order, and first come first served within a priority.
 */
export class RenderSlots {
	private running = 0;
	private waiting: Waiter[] = [];

	constructor(private readonly limit: number) {}

	/** Renders running right now, including any that just started. */
	get active() {
		return this.running;
	}

	private canStart(priority: RenderPriority) {
		return this.running < this.limit + (priority === 'quick' ? QUICK_RESERVE : 0);
	}

	acquire(priority: RenderPriority, signal?: AbortSignal): Promise<() => void> {
		signal?.throwIfAborted();
		let released = false;
		const release = () => {
			if (released) return;
			released = true;
			this.running--;
			this.next();
		};
		if (!this.waiting.some((entry) => RANK[entry.priority] <= RANK[priority]) && this.canStart(priority)) {
			this.running++;
			return Promise.resolve(release);
		}
		return new Promise((resolve, reject) => {
			const waiter: Waiter = {
				priority,
				start: () => {
					signal?.removeEventListener('abort', abort);
					this.running++;
					resolve(release);
				}
			};
			const abort = () => {
				this.waiting = this.waiting.filter((entry) => entry !== waiter);
				reject(signal!.reason);
			};
			signal?.addEventListener('abort', abort, { once: true });
			const index = this.waiting.findIndex((entry) => RANK[entry.priority] > RANK[priority]);
			if (index === -1) this.waiting.push(waiter);
			else this.waiting.splice(index, 0, waiter);
		});
	}

	private next() {
		while (this.waiting.length && this.canStart(this.waiting[0].priority)) this.waiting.shift()!.start();
	}
}

function renderLimit(): number {
	const configured = Number(env.RENDER_CONCURRENCY);
	if (Number.isInteger(configured) && configured > 0) return configured;
	return Math.max(2, Math.floor(availableParallelism() / 2));
}

let slots: RenderSlots | undefined;

/**
 * RawTherapee starts one OpenMP thread per core, and by default idle threads spin instead of sleeping.
 * Alone that is fastest, but renders running side by side then fight over the cores: on a 10-core server
 * five renders of an edit with three masks took 152s at once instead of 1.8s with sleeping threads. Sleeping
 * threads make a lone masked render about 2.5 times slower, though, so only renders that start next to
 * others sleep. Setting OMP_WAIT_POLICY yourself overrides this.
 */
const soloEnvironment = process.env;
const crowdedEnvironment = { ...process.env, OMP_WAIT_POLICY: process.env.OMP_WAIT_POLICY ?? 'passive' };

/**
 * Runs a command to completion. RawTherapee runs wait for a render slot in `priority` order;
 * `background` is shorthand for the lowest priority.
 */
export async function runCommand(command: string[], options: { signal?: AbortSignal; background?: boolean; priority?: RenderPriority } = {}) {
	const priority = options.priority ?? (options.background ? 'background' : 'final');
	if (command[0] !== 'rawtherapee-cli') return spawnCommand(command, options.signal, priority, process.env);
	slots ??= new RenderSlots(renderLimit());
	const release = await slots.acquire(priority, options.signal);
	try {
		await spawnCommand(command, options.signal, priority, slots.active > 1 ? crowdedEnvironment : soloEnvironment);
	} finally {
		release();
	}
}

function spawnCommand(command: string[], signal: AbortSignal | undefined, priority: RenderPriority, environment: NodeJS.ProcessEnv) {
	return new Promise<void>((resolve, reject) => {
		// nice execs the command in place, so aborting still kills the renderer itself.
		const niceness = NICENESS[priority];
		const prefixed = niceness ? ['nice', '-n', String(niceness), ...command] : command;
		const args = prefixed.slice(1);
		const commandName = prefixed[0];
		const proc = spawn(commandName, args, { signal, env: environment });
		let output = '';
		let errorOutput = '';

		proc.stdout.on('data', (data) => {
			output += data.toString();
		});

		proc.stderr.on('data', (data) => {
			errorOutput += data.toString();
		});

		proc.on('error', (error) => {
			if (errorOutput) {
				console.error(`Command error output: ${errorOutput}`);
			}
			reject(error);
		});

		proc.on('exit', (code) => {
			if (code !== 0) {
				reject(`\nCommand: ${command.join(' ')} \noutput: \n${output} \nerror: \n${errorOutput} \nexit code: ${code}`);
			} else {
				if (output) {
					console.log(`Command output: \n${output}`);
				}
				resolve();
			}
		});
	});
}
