import { assert } from '$lib';
import { countPP3Properties, diffPP3, parsePP3, type PP3 } from '$lib/pp3-utils';
import type { Image } from '$lib/server/db/schema';
import { parsePP3Document, stringifyPP3Document } from '$lib/pp3-document';
import { createGroupedDocument, restoreGroupedSettings } from '$lib/adjustment-groups';

const PREVIEW_UPDATE_INTERVAL = 100;

type EditState = { settings: PP3; disabledGroups: string[] };

class EditingState {
	public currentImageId = $state<string | null>(null);
	private baselines = $state<Record<string, EditState>>({});
	public pp3 = $state<PP3>() as PP3;
	public disabledGroups = $state<string[]>([]);
	public effectivePP3 = $derived(this.pp3 ? createGroupedDocument($state.snapshot(this.pp3), [...this.disabledGroups]).settings : {});
	public throttledPP3 = $state<PP3>({});
	public updateThrottledPP3 = (pp3: PP3) => {
		if (!pp3) return;
		if (countPP3Properties(diffPP3(this.throttledPP3, pp3)) === 0 && countPP3Properties(diffPP3(pp3, this.throttledPP3)) === 0) {
			this.cancelPreviewUpdate();
			return;
		}
		// Keep only the latest immutable edit, even while a trailing update is queued.
		this.pendingPreviewPP3 = structuredClone($state.snapshot(pp3));
		const remaining = PREVIEW_UPDATE_INTERVAL - (Date.now() - this.lastPreviewUpdate);
		if (remaining <= 0) {
			this.flushPreviewPP3();
		} else if (this.previewTimeout === null) {
			this.previewTimeout = setTimeout(() => this.flushPreviewPP3(), remaining);
		}
	};
	public lastSavedPP3 = $derived(this.currentImageId ? this.baselines[this.currentImageId]?.settings : undefined);
	public lastSavedDocument = $derived.by(() => {
		const saved = this.currentImageId ? this.baselines[this.currentImageId] : undefined;
		return saved ? stringifyPP3Document(createGroupedDocument($state.snapshot(saved.settings), [...saved.disabledGroups])) : '';
	});
	public isLoading = $state(false);
	public isFaulty = $state(false);
	public hasChanges = $derived(this.currentImageId !== null && this.hasChangesFor(this.currentImageId));

	private history = $state<EditState[]>([]);
	private historyIndex = $state(0);
	private lastChangeKey: string | null = null;
	private previewTimeout: ReturnType<typeof setTimeout> | null = null;
	private pendingPreviewPP3: PP3 | null = null;
	private lastPreviewUpdate = 0;
	private saveQueue: Promise<void> = Promise.resolve();
	private pendingSaves = new Map<string, number>();

	private cancelPreviewUpdate() {
		if (this.previewTimeout !== null) clearTimeout(this.previewTimeout);
		this.previewTimeout = null;
		this.pendingPreviewPP3 = null;
	}

	private flushPreviewPP3() {
		const latest = this.pendingPreviewPP3;
		this.cancelPreviewUpdate();
		if (!latest) return;
		this.lastPreviewUpdate = Date.now();
		this.throttledPP3 = latest;
	}

	private resetPreviewPP3(pp3: PP3) {
		this.cancelPreviewUpdate();
		this.lastPreviewUpdate = Date.now();
		this.throttledPP3 = structuredClone($state.snapshot(pp3));
	}

	private preparePP3(pp3: string | PP3, image: Image) {
		const newPp3 = typeof pp3 === 'string' ? parsePP3(pp3) : pp3;
		ensureSectionDefaults(newPp3, 'Exposure', {
			Enabled: true,
			Auto: false,
			Compensation: 0,
			Brightness: 0,
			Contrast: 0,
			Saturation: 0,
			HighlightCompr: 0,
			HighlightComprThreshold: 0,
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
		ensureSectionDefaults(newPp3, 'Vibrance', {
			Enabled: false,
			Pastels: 0,
			Saturated: 0,
			PSThreshold: '0;75;',
			ProtectSkins: true,
			AvoidColorShift: true,
			PastSatTog: false,
			SkinTonesCurve: '0;'
		});
		ensureSectionDefaults(newPp3, 'Local_Contrast', {
			Enabled: false,
			Radius: 80,
			Amount: 0.2,
			Darkness: 1,
			Lightness: 1
		});
		ensureSectionDefaults(newPp3, 'HSV_Equalizer', { Enabled: false, HCurve: '0;', SCurve: '0;', VCurve: '0;' });
		ensureSectionDefaults(newPp3, 'Dehaze', { Enabled: true, Strength: 0, Depth: 25, Saturation: 50, ShowDepthMap: false });
		ensureSectionDefaults(newPp3, 'Channel_Mixer', { Enabled: false, Red: '1000;0;0;', Green: '0;1000;0;', Blue: '0;0;1000;' });
		ensureSectionDefaults(newPp3, 'Film_Simulation', { Enabled: false, ClutFilename: '', Strength: 100 });
		ensureSectionDefaults(newPp3, 'White_Balance', { Setting: 'Camera' });
		setDefault(newPp3.White_Balance, 'Temperature', image.whiteBalance);
		setDefault(newPp3.White_Balance, 'Green', image.tint);
		return newPp3;
	}

	reset(pp3: string | PP3, image: Image, disabledGroups?: string[]) {
		const document = typeof pp3 === 'string' ? parsePP3Document(pp3) : { settings: pp3, comments: [] };
		this.disabledGroups = disabledGroups ?? document.ui?.disabledGroups ?? [];
		this.pp3 = this.preparePP3(restoreGroupedSettings(document), image);
		this.pushHistory();
		this.resetPreviewPP3(this.effectivePP3);
	}

	initialize(pp3: string | PP3, image: Image) {
		assert(image, 'Image must be provided to initialize editing state');
		if (this.currentImageId === String(image.id) && (this.hasChangesFor(String(image.id)) || this.pendingSaves.has(String(image.id)))) return;
		const document = typeof pp3 === 'string' ? parsePP3Document(pp3) : { settings: pp3, comments: [] };
		this.disabledGroups = document.ui?.disabledGroups ?? [];
		const newPp3 = this.preparePP3(restoreGroupedSettings(document), image);

		const id = image.id.toString();

		this.pp3 = newPp3;
		this.resetPreviewPP3(this.effectivePP3);
		// Store an immutable snapshot so undo can restore the initial state.
		this.history = [this.captureState()];
		this.historyIndex = 0;
		this.lastChangeKey = null;
		this.currentImageId = id;
		this.baselines[id] = this.captureState();
	}

	toggleGroup(group: string) {
		this.disabledGroups = this.disabledGroups.includes(group) ? this.disabledGroups.filter((item) => item !== group) : [...this.disabledGroups, group];
		this.pushHistory(true);
	}

	serialize() {
		return stringifyPP3Document(createGroupedDocument($state.snapshot(this.pp3), [...this.disabledGroups]));
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

		const saved = this.captureState();
		const serialized = stringifyPP3Document(createGroupedDocument(saved.settings, saved.disabledGroups));
		this.pendingSaves.set(id, (this.pendingSaves.get(id) ?? 0) + 1);
		const task = this.saveQueue
			.catch(() => {})
			.then(async () => {
				try {
					const res = await fetch(`/api/images/${id}/snapshots`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						keepalive: true,
						body: JSON.stringify({ pp3: serialized })
					});

					if (!res.ok) {
						throw new Error('Failed to save snapshot');
					}

					this.baselines[id] = saved;
					if (this.currentImageId === id) {
						this.isFaulty = false;
					}
				} catch (error) {
					if (this.currentImageId === id) this.isFaulty = true;
					throw error;
				} finally {
					const remaining = (this.pendingSaves.get(id) ?? 1) - 1;
					if (remaining) this.pendingSaves.set(id, remaining);
					else this.pendingSaves.delete(id);
				}
			});
		this.saveQueue = task;
		await task;
	}

	pushHistory(separate = false) {
		if (separate) this.lastChangeKey = null;
		const snapshot = this.captureState();
		const prev = this.history[this.historyIndex];

		let diff = diffPP3(prev?.settings, snapshot.settings);
		if (countPP3Properties(diff) === 0) diff = diffPP3(snapshot.settings, prev?.settings);
		const changedCount = countPP3Properties(diff);

		const groupsChanged = JSON.stringify(prev?.disabledGroups ?? []) !== JSON.stringify(snapshot.disabledGroups);
		if (changedCount === 0 && !groupsChanged) return;

		let changeKey: string | null = null;
		if (changedCount === 1) {
			for (const section in diff) {
				for (const key in diff[section]) {
					changeKey = `${section}.${key}`;
				}
			}
		}

		if (!groupsChanged && changeKey && changeKey === this.lastChangeKey) {
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
		this.resetPreviewPP3(this.effectivePP3);
	}

	redo() {
		if (!this.canRedo) return;
		this.historyIndex++;
		this.lastChangeKey = null;
		this.applyHistorySnapshot(this.history[this.historyIndex]);
		this.resetPreviewPP3(this.effectivePP3);
	}

	hasChangesFor(imageId: string) {
		const baseline = this.baselines[imageId];
		if (!baseline) return false;
		return (
			JSON.stringify(baseline.disabledGroups) !== JSON.stringify(this.disabledGroups) ||
			countPP3Properties(diffPP3(baseline.settings, this.pp3)) > 0 ||
			countPP3Properties(diffPP3(this.pp3, baseline.settings)) > 0
		);
	}

	private captureState(): EditState {
		return { settings: structuredClone($state.snapshot(this.pp3)), disabledGroups: [...this.disabledGroups] };
	}

	private applyHistorySnapshot(state: EditState) {
		const next = structuredClone($state.snapshot(state.settings));
		this.disabledGroups = [...state.disabledGroups];
		if (!this.pp3) {
			this.pp3 = next;
			return;
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
