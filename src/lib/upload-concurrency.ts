/** Conservative upload-only throughput sampling; excludes preparation/server idle time. */
export class UploadConcurrency {
	private lastTime = 0;
	private lastBytes = 0;
	private measuredSeconds = 0;
	private rate = 0;
	private concurrency = 1;

	reset(now: number) {
		this.lastTime = now;
		this.lastBytes = 0;
		this.measuredSeconds = 0;
		this.rate = 0;
		this.concurrency = 1;
	}

	sample(totalBytes: number, largestFile: number, sending: boolean, now: number): number {
		const seconds = (now - this.lastTime) / 1000;
		const bytes = Math.max(0, totalBytes - this.lastBytes);
		this.lastTime = now;
		this.lastBytes = totalBytes;
		if (seconds <= 0 || (!sending && bytes === 0)) return this.concurrency;
		this.measuredSeconds += seconds;
		const currentRate = bytes / seconds;
		// React promptly to slowdowns; smooth increases to avoid progress-event bursts.
		this.rate = this.rate ? Math.min(currentRate, this.rate * 0.8 + currentRate * 0.2) : currentRate;
		if (this.measuredSeconds < 6 || largestFile <= 0) return this.concurrency;
		// Target <=7 minutes with an additional 30% bandwidth margin against the
		// deployment's 10-minute body-read timeout. Never exceed three jobs.
		const safe = Math.max(1, Math.min(3, Math.floor(this.rate * 420 * 0.7 / largestFile)));
		this.concurrency = Math.min(safe, this.concurrency + 1);
		return this.concurrency;
	}
}
