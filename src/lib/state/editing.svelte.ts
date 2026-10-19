import { assert } from '$lib';
import { countPP3Properties, diffPP3, parsePP3, type PP3 } from '$lib/pp3-utils';
import type { Image } from '$lib/server/db/schema';
import { parsePP3Document, stringifyPP3Document } from '$lib/pp3-document';
import { normalizeDisabledGroups, restoreGroupedSettings, groupNeutralSettings } from '$lib/adjustment-groups';
import { createEditDocument, normalizeEditStrength, type StrengthWhiteBalance } from '$lib/edit-strength';
import { EditPreviewScheduler } from '$lib/edit-preview-scheduler';
import { SnapshotQueue } from '$lib/snapshot-queue';
import { changedStructuralChapters, pp3EditDistance, snapshotDecision } from '$lib/snapshot-classifier';
import { creativeDefaults } from '$lib/creative-adjustments';
import { ensureMaskSettings } from '$lib/local-masks';

type EditState = { settings: PP3; disabledGroups: string[]; editStrength: number };
type SavedVersion = { imageId: string; id: number; createdAt: number; settings: PP3; exported: boolean };
type SnapshotOutcome = 'create' | 'update' | 'unchanged';

class EditingState {
	public currentImageId = $state<string | null>(null);
	private baselines = $state<Record<string, EditState>>({});
	public pp3 = $state<PP3>() as PP3;
	public disabledGroups = $state<string[]>([]);
	public editStrength = $state(100);
	private strengthWhiteBalance = $state<StrengthWhiteBalance>({});
	public effectivePP3 = $derived(this.pp3 ? createEditDocument($state.snapshot(this.pp3), [...this.disabledGroups], this.editStrength, this.strengthWhiteBalance).settings : {});
	public throttledPP3 = $state<PP3>({});
	public updateThrottledPP3 = (pp3: PP3) => {
		if (!pp3) return;
		this.previewScheduler.update($state.snapshot(pp3));
	};
	public lastSavedPP3 = $derived(this.currentImageId ? this.baselines[this.currentImageId]?.settings : undefined);
	public lastSavedDocument = $derived.by(() => {
		const saved = this.currentImageId ? this.baselines[this.currentImageId] : undefined;
		return saved ? stringifyPP3Document(createEditDocument($state.snapshot(saved.settings), [...saved.disabledGroups], saved.editStrength, this.strengthWhiteBalance)) : '';
	});
	public isLoading = $state(false);
	public isFaulty = $state(false);
	public isSaving = $state(false);
	/** Bumped whenever the edit changes, so autosave can debounce on it. */
	public changeRevision = $state(0);
	public hasChanges = $derived(this.currentImageId !== null && this.hasChangesFor(this.currentImageId));

	private history = $state<EditState[]>([]);
	private historyIndex = $state(0);
	private lastChangeKey: string | null = null;
	private previewScheduler = new EditPreviewScheduler((settings) => {
		this.throttledPP3 = settings;
	});
	private snapshots = new SnapshotQueue();
	/** The version autosave updates in place until a meaningful change lands. */
	private savedVersion = $state.raw<SavedVersion | null>(null);
	/** Whether the current photo has any saved version, including one autosave just wrote. */
	public hasSavedVersion = $derived(!!this.currentImageId && this.savedVersion?.imageId === this.currentImageId);

	private resetPreviewPP3(pp3: PP3) {
		this.previewScheduler.reset($state.snapshot(pp3));
	}

	private preparePP3(pp3: string | PP3, image: Image) {
		const newPp3 = typeof pp3 === 'string' ? parsePP3(pp3) : pp3;
		for (const [section, defaults] of Object.entries(creativeDefaults)) ensureSectionDefaults(newPp3, section, defaults);
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
			Enabled: true,
			Radius: 80,
			Amount: 0,
			Darkness: 1,
			Lightness: 1
		});
		ensureSectionDefaults(newPp3, 'HSV_Equalizer', { Enabled: false, HCurve: '0;', SCurve: '0;', VCurve: '0;' });
		ensureSectionDefaults(newPp3, 'Dehaze', { Enabled: false, Strength: 0, Depth: 25, Saturation: 50, ShowDepthMap: false });
		ensureSectionDefaults(newPp3, 'PCVignette', { Enabled: false, Strength: 0, Feather: 50, Roundness: 50 });
		ensureSectionDefaults(newPp3, 'Gradient', { Enabled: false, Strength: 0, Degree: 0, Feather: 50, CenterX: 0, CenterY: 0 });
		ensureSectionDefaults(newPp3, 'Locallab', { Enabled: false, Selspot: 0 });
		// Masks saved before a setting existed carry no key for it, and the mask panel binds to every one
		ensureMaskSettings(newPp3);
		ensureSectionDefaults(newPp3, 'Channel_Mixer', { Enabled: false, Red: '1000;0;0;', Green: '0;1000;0;', Blue: '0;0;1000;' });
		ensureSectionDefaults(newPp3, 'Film_Simulation', { Enabled: false, ClutFilename: '', Strength: 100 });
		ensureSectionDefaults(newPp3, 'Sharpening', { Enabled: false, Amount: 50, Radius: 1, Method: 'usm' });
		ensureSectionDefaults(newPp3, 'Directional_Pyramid_Denoising', {
			Enabled: false,
			Luma: 0,
			Ldetail: 0,
			Chroma: 0,
			Method: 'Lab',
			LMethod: 'SLI',
			CMethod: 'MAN',
			C2Method: 'MANU',
			AutoGain: true,
			Gamma: 1.7
		});
		ensureSectionDefaults(newPp3, 'White_Balance', { Setting: 'Camera' });
		setDefault(newPp3.White_Balance, 'Temperature', image.whiteBalance);
		setDefault(newPp3.White_Balance, 'Green', image.tint);
		// Neutral tools are ready for input; preserve disabled non-neutral edits.
		for (const [section, fields] of Object.entries({
			Dehaze: ['Strength'],
			Local_Contrast: ['Amount'],
			PCVignette: ['Strength'],
			Vibrance: ['Pastels', 'Saturated'],
			'Shadows_&_Highlights': ['Highlights', 'Shadows']
		})) {
			if (fields.every((field) => Number(newPp3[section]?.[field] ?? 0) === 0)) newPp3[section].Enabled = true;
		}
		if (
			newPp3.ColorToning.Method === 'Splitlr' &&
			['ShadowsColorSaturation', 'HighlightsColorSaturation'].every((key) => Number(String(newPp3.ColorToning[key]).split(';')[0]) === 0)
		)
			newPp3.ColorToning.Enabled = true;
		return newPp3;
	}

	reset(pp3: string | PP3, image: Image, disabledGroups?: string[], editStrength?: number) {
		const document = typeof pp3 === 'string' ? parsePP3Document(pp3) : { settings: pp3, comments: [] };
		this.disabledGroups = normalizeDisabledGroups(disabledGroups ?? document.ui?.disabledGroups ?? []);
		this.editStrength = normalizeEditStrength(editStrength ?? document.ui?.editStrength ?? 100);
		this.strengthWhiteBalance = { temperature: image.whiteBalance, green: image.tint };
		this.pp3 = this.preparePP3(restoreGroupedSettings(document), image);
		this.pushHistory();
		this.resetPreviewPP3(this.effectivePP3);
	}

	initialize(pp3: string | PP3, image: Image) {
		assert(image, 'Image must be provided to initialize editing state');
		if (this.currentImageId === String(image.id) && (this.hasChangesFor(String(image.id)) || this.snapshots.hasPending(String(image.id)))) return;
		const document = typeof pp3 === 'string' ? parsePP3Document(pp3) : { settings: pp3, comments: [] };
		this.disabledGroups = normalizeDisabledGroups(document.ui?.disabledGroups ?? []);
		this.editStrength = document.ui?.editStrength ?? 100;
		this.strengthWhiteBalance = { temperature: image.whiteBalance, green: image.tint };
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
		return stringifyPP3Document(createEditDocument($state.snapshot(this.pp3), [...this.disabledGroups], this.editStrength, this.strengthWhiteBalance));
	}

	get canUndo() {
		return this.historyIndex > 0;
	}

	get canRedo() {
		return this.historyIndex < this.history.length - 1;
	}

	/**
	 * Records the image's newest saved version. Autosave rewrites it in place
	 * until the classifier asks for a version of its own.
	 */
	noteSavedVersion(imageId: string, snapshot?: { id: number; createdAt: string | Date; pp3: string } | null, exportedAt?: string | Date | null) {
		if (String(imageId) !== this.currentImageId) return;
		const current = this.savedVersion;
		// Stale page data must not move the target back to an older version.
		if (snapshot && current && current.imageId === String(imageId) && current.id > snapshot.id) return;
		if (!snapshot) {
			this.savedVersion = null;
			return;
		}
		const createdAt = new Date(snapshot.createdAt).getTime();
		this.savedVersion = {
			imageId: String(imageId),
			id: snapshot.id,
			createdAt,
			settings: parsePP3(snapshot.pp3),
			exported: !!exportedAt && new Date(exportedAt).getTime() >= createdAt
		};
	}

	private snapshotTail: Promise<unknown> = Promise.resolve();

	/**
	 * Saves run one at a time: a second flush (tab hide plus page hide, autosave plus
	 * navigation) must see the first one's result, or it would create a duplicate version.
	 */
	snapshot(options: { force?: boolean } = {}): Promise<SnapshotOutcome> {
		const run = this.snapshotTail.catch(() => {}).then(() => this.writeSnapshot(options));
		this.snapshotTail = run;
		return run;
	}

	private async writeSnapshot(options: { force?: boolean }): Promise<SnapshotOutcome> {
		const id = this.currentImageId;
		assert(id, 'No current image to snapshot');

		if (!this.hasChangesFor(id)) {
			return 'unchanged';
		}

		const saved = this.captureState();
		const serialized = stringifyPP3Document(createEditDocument(saved.settings, saved.disabledGroups, saved.editStrength, this.strengthWhiteBalance));
		const version = this.savedVersion?.imageId === id ? this.savedVersion : undefined;
		const outcome =
			options.force || !version
				? 'create'
				: snapshotDecision({
						hasSnapshot: true,
						ageMs: Date.now() - version.createdAt,
						exported: version.exported,
						structural: changedStructuralChapters(version.settings, parsePP3(serialized)).length > 0,
						distance: pp3EditDistance(version.settings, parsePP3(serialized))
					});

		this.isSaving = true;
		try {
			const updateTarget = outcome === 'update' && version ? version.id : undefined;
			const written = await this.snapshots.save(id, serialized, updateTarget);
			this.baselines[id] = saved;
			// A save that fell back to a new version moved the target forward.
			this.savedVersion = {
				imageId: id,
				id: written.id,
				createdAt: new Date(written.createdAt).getTime(),
				settings: parsePP3(serialized),
				exported: false
			};
			if (this.currentImageId === id) this.isFaulty = false;
		} catch (error) {
			if (this.currentImageId === id) this.isFaulty = true;
			throw error;
		} finally {
			if (this.currentImageId === id) this.isSaving = false;
		}
		return outcome;
	}

	pushHistory(separate = false) {
		if (separate) this.lastChangeKey = null;
		const prev = this.history[this.historyIndex];
		if (prev) {
			const changes = diffPP3(prev.settings, this.pp3);
			const changedSections = Object.entries(changes)
				.filter(([, fields]) => Object.keys(fields).some((key) => key !== 'Enabled'))
				.map(([section]) => section);
			for (const section of changedSections) {
				// Explicit tool toggles and resets keep their requested enabled state.
				if ('Enabled' in this.pp3[section] && !('Enabled' in changes[section])) this.pp3[section].Enabled = true;
			}
			this.disabledGroups = this.disabledGroups.filter(
				(group) =>
					!Object.entries(groupNeutralSettings[group] ?? {}).some(([section, neutral]) => {
						const fields = changes[section];
						if (!fields) return false;
						return Object.keys(fields).some((key) => key !== 'Enabled' && ('Enabled' in neutral || key in neutral));
					})
			);
		}
		const snapshot = this.captureState();

		let diff = diffPP3(prev?.settings, snapshot.settings);
		if (countPP3Properties(diff) === 0) diff = diffPP3(snapshot.settings, prev?.settings);
		const changedCount = countPP3Properties(diff);

		const groupsChanged = JSON.stringify(prev?.disabledGroups ?? []) !== JSON.stringify(snapshot.disabledGroups);
		const strengthChanged = prev?.editStrength !== snapshot.editStrength;
		if (changedCount === 0 && !groupsChanged && !strengthChanged) return;
		// Autosave debounces on this, so a change must always land here.
		this.changeRevision += 1;

		let changeKey: string | null = null;
		if (strengthChanged && changedCount === 0 && !groupsChanged) changeKey = 'editStrength';
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
		this.changeRevision += 1;
	}

	redo() {
		if (!this.canRedo) return;
		this.historyIndex++;
		this.lastChangeKey = null;
		this.applyHistorySnapshot(this.history[this.historyIndex]);
		this.resetPreviewPP3(this.effectivePP3);
		this.changeRevision += 1;
	}

	hasChangesFor(imageId: string) {
		const baseline = this.baselines[imageId];
		if (!baseline) return false;
		return (
			baseline.editStrength !== this.editStrength ||
			JSON.stringify(baseline.disabledGroups) !== JSON.stringify(this.disabledGroups) ||
			countPP3Properties(diffPP3(baseline.settings, this.pp3)) > 0 ||
			countPP3Properties(diffPP3(this.pp3, baseline.settings)) > 0
		);
	}

	private captureState(): EditState {
		return { settings: structuredClone($state.snapshot(this.pp3)), disabledGroups: [...this.disabledGroups], editStrength: this.editStrength };
	}

	private applyHistorySnapshot(state: EditState) {
		const next = structuredClone($state.snapshot(state.settings));
		this.disabledGroups = [...state.disabledGroups];
		this.editStrength = state.editStrength;
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

function setDefault(section: PP3[keyof PP3], key: string, value: number | null) {
	if (!(key in section)) {
		// A missing value is recorded as-is (including null) so the key exists.
		section[key] = value as number;
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
