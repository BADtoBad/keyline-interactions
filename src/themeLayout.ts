import { localize } from './locale/ui';
export interface ThemeLayoutSettings {
	textMaxWidth: number;
	/** -1 preserves the theme's responsive margins; 0 is a real zero inset. */
	pageSidePadding: number;
	editorLineHeight: number;
	readingLineHeight: number;
	paragraphGap: number;
	paragraphBefore: number;
	paragraphAfter: number;
	firstLineIndent: number;
	listLineHeight: number;
	listItemSpacing: number;
	listIndent: number;
	listMarkerGap: number;
	listBulletSize: number;
	blockquoteIndent: number;
	headingBefore: number;
	headingAfter: number;
}

export type ThemeLayoutSettingKey = keyof ThemeLayoutSettings;

export interface ThemeLayoutSettingSpec {
	min: number;
	max: number;
	step: number;
	unit: "" | "em" | "px";
	cssVariable: `--ncl-${string}`;
}

export const DEFAULT_THEME_LAYOUT_SETTINGS: ThemeLayoutSettings = {
	textMaxWidth: 600,
	pageSidePadding: -1,
	editorLineHeight: 1.85,
	readingLineHeight: 1.8,
	paragraphGap: 1,
	paragraphBefore: 1,
	paragraphAfter: 1,
	firstLineIndent: 0,
	listLineHeight: 1.8,
	listItemSpacing: 0,
	listIndent: 1.8,
	listMarkerGap: 10,
	listBulletSize: 7,
	blockquoteIndent: 16,
	headingBefore: 1.8,
	headingAfter: 0.6,
};

export const THEME_LAYOUT_SETTING_SPECS: Record<ThemeLayoutSettingKey, ThemeLayoutSettingSpec> = {
	textMaxWidth: {
		min: 320,
		max: 1600,
		step: 20,
		unit: "px",
		cssVariable: "--ncl-text-max-width",
	},
	pageSidePadding: {
		min: -1,
		max: 160,
		step: 1,
		unit: "px",
		cssVariable: "--ncl-page-side-padding",
	},
	editorLineHeight: {
		min: 1.2,
		max: 2.2,
		step: 0.05,
		unit: "",
		cssVariable: "--ncl-editor-line-height",
	},
	readingLineHeight: {
		min: 1.2,
		max: 2.2,
		step: 0.05,
		unit: "",
		cssVariable: "--ncl-reading-line-height",
	},
	paragraphGap: {
		min: 0,
		max: 1.5,
		step: 0.05,
		unit: "em",
		cssVariable: "--ncl-paragraph-gap",
	},
	paragraphBefore: {
		min: 0,
		max: 2,
		step: 0.05,
		unit: "em",
		cssVariable: "--ncl-paragraph-before",
	},
	paragraphAfter: {
		min: 0,
		max: 2,
		step: 0.05,
		unit: "em",
		cssVariable: "--ncl-paragraph-after",
	},
	firstLineIndent: {
		min: 0,
		max: 4,
		step: 0.25,
		unit: "em",
		cssVariable: "--ncl-first-line-indent",
	},
	listLineHeight: {
		min: 1.2,
		max: 2.2,
		step: 0.05,
		unit: "",
		cssVariable: "--ncl-list-line-height",
	},
	listItemSpacing: {
		min: 0,
		max: 0.8,
		step: 0.02,
		unit: "em",
		cssVariable: "--ncl-list-item-spacing",
	},
	listIndent: {
		min: 0.75,
		max: 3.5,
		step: 0.05,
		unit: "em",
		cssVariable: "--ncl-list-indent",
	},
	listMarkerGap: {
		min: 4,
		max: 18,
		step: 1,
		unit: "px",
		cssVariable: "--ncl-list-marker-gap",
	},
	listBulletSize: {
		min: 3,
		max: 8,
		step: 0.5,
		unit: "px",
		cssVariable: "--ncl-list-bullet-size",
	},
	blockquoteIndent: {
		min: 8,
		max: 32,
		step: 1,
		unit: "px",
		cssVariable: "--ncl-blockquote-indent",
	},
	headingBefore: {
		min: 0.5,
		max: 3,
		step: 0.1,
		unit: "em",
		cssVariable: "--ncl-heading-before",
	},
	headingAfter: {
		min: 0,
		max: 1.5,
		step: 0.05,
		unit: "em",
		cssVariable: "--ncl-heading-after",
	},
};

const decimalPlaces = (step: number): number => {
	const text = String(step);
	return text.includes(".") ? text.length - text.indexOf(".") - 1 : 0;
};

const normalizeValue = (value: unknown, spec: ThemeLayoutSettingSpec, fallback: number): number => {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed)) return fallback;

	const clamped = Math.min(spec.max, Math.max(spec.min, parsed));
	const precision = decimalPlaces(spec.step);
	const stepped = spec.min + Math.round((clamped - spec.min) / spec.step) * spec.step;
	return Number(stepped.toFixed(precision));
};

export const normalizeThemeLayoutSettings = (
	input: Partial<ThemeLayoutSettings> | null | undefined
): ThemeLayoutSettings => {
	// 0.3.5 and earlier persisted every legacy key but none of the three new
	// rhythm controls. That release also allowed a 40px quote inset. The Figma
	// redesign makes 16px part of the new baseline, so migrate that one value
	// once while preserving every unrelated user adjustment.
	const legacyKeys: ThemeLayoutSettingKey[] = [
		"editorLineHeight",
		"readingLineHeight",
		"paragraphBefore",
		"paragraphAfter",
		"firstLineIndent",
		"listIndent",
		"listMarkerGap",
		"listBulletSize",
		"blockquoteIndent",
		"headingBefore",
		"headingAfter",
	];
	const isLegacyCompleteLayout = input !== null
		&& input !== undefined
		&& legacyKeys.every((key) => Object.prototype.hasOwnProperty.call(input, key))
		&& !Object.prototype.hasOwnProperty.call(input, "paragraphGap")
		&& !Object.prototype.hasOwnProperty.call(input, "listLineHeight")
		&& !Object.prototype.hasOwnProperty.call(input, "listItemSpacing");
	const normalized = {} as ThemeLayoutSettings;
	for (const key of Object.keys(THEME_LAYOUT_SETTING_SPECS) as ThemeLayoutSettingKey[]) {
		const spec = THEME_LAYOUT_SETTING_SPECS[key];
		const candidate = key === "blockquoteIndent" && isLegacyCompleteLayout
			? undefined
			: input?.[key];
		normalized[key] = normalizeValue(candidate, spec, DEFAULT_THEME_LAYOUT_SETTINGS[key]);
	}
	return normalized;
};

export const formatThemeLayoutValue = (key: ThemeLayoutSettingKey, value: number): string => {
	if (key === "pageSidePadding" && value === -1) return localize("自动");
	const spec = THEME_LAYOUT_SETTING_SPECS[key];
	const precision = decimalPlaces(spec.step);
	const formatted = value.toFixed(precision).replace(/\.0+$/u, "").replace(/(\.\d*?)0+$/u, "$1");
	return `${formatted}${spec.unit}`;
};

export const themeLayoutCssVariables = (
	input: Partial<ThemeLayoutSettings> | null | undefined
): Record<string, string> => {
	const settings = normalizeThemeLayoutSettings(input);
	const variables: Record<string, string> = {};
	for (const key of Object.keys(THEME_LAYOUT_SETTING_SPECS) as ThemeLayoutSettingKey[]) {
		variables[THEME_LAYOUT_SETTING_SPECS[key].cssVariable] = formatThemeLayoutValue(key, settings[key]);
	}
	// `initial` makes this optional custom property use its CSS fallback. It
	// restores responsive margins on reset without ever emitting a negative
	// length or the display-only word "自动". Percentages resolve at the actual
	// pane/preview, so a large requested inset cannot consume a narrow pane.
	variables["--ncl-page-side-padding"] = settings.pageSidePadding === -1
		? "initial"
		: `min(${settings.pageSidePadding}px, 20%)`;
	// Obsidian uses separate variables for the first list marker and subsequent
	// nesting steps. Let one control move both without turning the default 2em
	// hierarchy step into an oversized 2em first-level gutter.
	const firstLevelIndent = Math.max(0.5, settings.listIndent * 0.4);
	variables["--ncl-list-first-indent"] = `${Number(firstLevelIndent.toFixed(2))}em`;
	return variables;
};
