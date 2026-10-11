import { countPP3Properties, diffPP3, type PP3 } from './pp3-utils';

/** Latest-value throttle. Owns timing only, not the editing document. */
export class EditPreviewScheduler {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private pending: PP3 | null = null;
	private published: PP3 = {};
	private lastPublished = 0;

	constructor(private publish: (settings: PP3) => void, private interval = 100) {}

	update(settings: PP3) {
		if (countPP3Properties(diffPP3(this.published, settings)) === 0 && countPP3Properties(diffPP3(settings, this.published)) === 0) {
			this.cancel();
			return;
		}
		this.pending = structuredClone(settings);
		const remaining = this.interval - (Date.now() - this.lastPublished);
		if (remaining <= 0) this.flush();
		else if (this.timer === null) this.timer = setTimeout(() => this.flush(), remaining);
	}

	reset(settings: PP3) {
		this.cancel();
		this.deliver(structuredClone(settings));
	}

	cancel() {
		if (this.timer !== null) clearTimeout(this.timer);
		this.timer = null;
		this.pending = null;
	}

	private flush() {
		const latest = this.pending;
		this.cancel();
		if (latest) this.deliver(latest);
	}

	private deliver(settings: PP3) {
		this.lastPublished = Date.now();
		this.published = settings;
		this.publish(settings);
	}
}
