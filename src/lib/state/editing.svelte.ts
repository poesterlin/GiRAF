import { assert, throttle } from '$lib';
import { countPP3Properties, diffPP3, parsePP3, stringifyPP3, type PP3 } from '$lib/pp3-utils';
import type { Image } from '$lib/server/db/schema';

class EditingState {
	public pp3 = $state<PP3>() as PP3;
	public throttledPP3 = $state<PP3>({});
	public updateThrottledPP3 = throttle((pp3) => (this.throttledPP3 = pp3), 300);
	public lastSavedPP3 = $state<PP3>() as PP3;
	public currentImageId = $state<string | null>(null);
	public isLoading = $state(false);
	public isFaulty = $state(false);
	public hasChanges = $state(false);

	private history = $state<PP3[]>([]);
	private historyIndex = $state(0);
	private lastChangeKey: string | null = null;
	private baselineByImageId = {} as Record<string, PP3>;


	initialize(pp3: string | PP3, image: Image) {
		assert(image, 'Image must be provided to initialize editing state');

		const newPp3 = typeof pp3 === 'string' ? parsePP3(pp3) : pp3;
		ensureSectionDefaults(newPp3, 'Exposure', {
			Enabled: true,
			Auto: false,
			Compensation: 0,
			Brightness: 0,
			Contrast: 0,
			Saturation: 0,
			HighlightCompr: 0,
			ShadowCompr: 0,
			Black: 0
		});
		ensureSectionDefaults(newPp3, 'Shadows_&_Highlights', {
			Enabled: false,
			Highlights: 0,
			HighlightTonalWidth: 70,
			Shadows: 0,
			ShadowTonalWidth: 30,
			Radius: 40,
			Lab: false
		});
		ensureSectionDefaults(newPp3, 'Rotation', {
			Enabled: true,
			Degree: 0
		});
		setDefault(newPp3.White_Balance, "Temperature", image.whiteBalance);
		setDefault(newPp3.White_Balance, "Green", image.tint);

		const id = image.id.toString();

		this.pp3 = newPp3;
		this.throttledPP3 = newPp3;
		// Store an immutable snapshot so undo can restore the initial state.
		this.history = [structuredClone($state.snapshot(newPp3))];
		this.historyIndex = 0;
		this.currentImageId = id;
		this.lastSavedPP3 = structuredClone($state.snapshot(newPp3));
		this.setBaseline(id, newPp3);
	}

	update(_updated: PP3) {
		this.hasChanges = this.hasChangesFor(this.currentImageId!);
	}

	get canUndo() {
		return this.historyIndex > 0;
	}

	get canRedo() {
		return this.historyIndex < this.history.length - 1;
	}

	async snapshot() {
		const id = this.currentImageId;
		assert(id, 'No current image to snapshot');

		if (!this.hasChangesFor(id)) {
			return;
		}

		edits.lastSavedPP3 = structuredClone($state.snapshot(edits.pp3));
		edits.setBaseline(id, edits.lastSavedPP3);
		this.hasChanges = false;

		const res = await fetch(`/api/images/${id}/snapshots`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			keepalive: true,
			body: JSON.stringify({ pp3: stringifyPP3(edits.lastSavedPP3) })
		});

		if (!res.ok) {
			edits.isFaulty = true;
			throw new Error('Failed to save snapshot');
		}

		edits.isFaulty = false;
	}

	pushHistory() {
		const snapshot = structuredClone($state.snapshot(this.pp3));
		const prev = this.history[this.historyIndex];

		const diff = diffPP3(prev, snapshot);
		const changedCount = countPP3Properties(diff);

		if (changedCount === 0) return;

		let changeKey: string | null = null;
		if (changedCount === 1) {
			for (const section in diff) {
				for (const key in diff[section]) {
					changeKey = `${section}.${key}`;
				}
			}
		}

		if (changeKey && changeKey === this.lastChangeKey) {
			this.history[this.historyIndex] = snapshot;
		} else {
			this.history = this.history.slice(0, this.historyIndex + 1);
			this.history.push(snapshot);
			this.historyIndex = this.history.length - 1;
		}

		this.lastChangeKey = changeKey;
	}

	undo() {
		if (!this.canUndo) return;
		this.historyIndex--;
		this.lastChangeKey = null;
		this.applyHistorySnapshot(this.history[this.historyIndex]);
		this.throttledPP3 = this.pp3;
		this.hasChanges = this.hasChangesFor(this.currentImageId!);
	}

	redo() {
		if (!this.canRedo) return;
		this.historyIndex++;
		this.lastChangeKey = null;
		this.applyHistorySnapshot(this.history[this.historyIndex]);
		this.throttledPP3 = this.pp3;
		this.hasChanges = this.hasChangesFor(this.currentImageId!);
	}

	hasChangesFor(imageId: string) {
		const baseline = this.baselineByImageId[imageId];
		if (!baseline) return false;
		return countPP3Properties(diffPP3(baseline, this.pp3)) > 0;
	}

	private setBaseline(imageId: string, pp3: PP3) {
		const snapshot = structuredClone($state.snapshot(pp3));
		this.baselineByImageId = { ...this.baselineByImageId, [imageId]: snapshot };
	}

	private applyHistorySnapshot(snapshot: PP3) {
		if (!this.pp3) {
			this.pp3 = structuredClone(snapshot);
			return;
		}

		let next: PP3 = {};
		try {
			// sometimes failes
			next = structuredClone(snapshot);
		} catch (error) {
			next = JSON.parse(JSON.stringify(snapshot));
		}

		for (const section in this.pp3) {
			if (!(section in next)) {
				delete this.pp3[section];
			}
		}

		for (const section in next) {
			this.pp3[section] = next[section];
		}
	}
}

export const edits = new EditingState();

function setDefault(section: PP3[keyof PP3], key: string, value: any) {
	if (!(key in section)) {
		section[key] = value;
		return;
	}

	if (section[key] === undefined && value) {
		section[key] = value;
	}
}

function ensureSectionDefaults(pp3: PP3, section: string, defaults: Record<string, string | number | boolean>) {
	if (!pp3[section]) {
		pp3[section] = {};
	}

	for (const [key, value] of Object.entries(defaults)) {
		if (pp3[section][key] === undefined) {
			pp3[section][key] = value;
		}
	}
}
