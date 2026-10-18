import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
	DEFAULT_THEME_LAYOUT_SETTINGS,
	formatThemeLayoutValue,
	normalizeThemeLayoutSettings,
	themeLayoutCssVariables,
} from "./.build/themeLayout.js";

test("missing layout settings resolve to complete theme defaults", () => {
	assert.deepEqual(normalizeThemeLayoutSettings(null), DEFAULT_THEME_LAYOUT_SETTINGS);
});

test("theme defaults equal the user's accepted test-vault profile", () => {
	assert.deepEqual(DEFAULT_THEME_LAYOUT_SETTINGS, {
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
	});
});

test("Keyline theme-alone CSS and plugin reset use the same complete profile", () => {
	const workspaceTheme = new URL("../../theme/Keyline/theme.css", import.meta.url);
	// Standalone releases carry an exact, licensed snapshot of the paired theme.
	const css = readFileSync(existsSync(workspaceTheme) ? workspaceTheme : new URL("./fixtures/Keyline/theme.css", import.meta.url), "utf8");
	for (const [property, value] of Object.entries(themeLayoutCssVariables(DEFAULT_THEME_LAYOUT_SETTINGS))) {
		const match = css.match(new RegExp(`${property}:\\s*([^;]+);`, "u"));
		assert.equal(match?.[1], value, property);
	}
});

test("the pre-Figma complete layout migrates only the quote inset", () => {
	const legacy = {
		editorLineHeight: 1.8,
		readingLineHeight: 1.8,
		paragraphBefore: 1,
		paragraphAfter: 1,
		firstLineIndent: 0,
		listIndent: 0.75,
		listMarkerGap: 12,
		listBulletSize: 7,
		blockquoteIndent: 40,
		headingBefore: 1.8,
		headingAfter: 0.6,
	};
	const normalized = normalizeThemeLayoutSettings(legacy);

	assert.equal(normalized.blockquoteIndent, 16);
	assert.equal(normalized.editorLineHeight, 1.8);
	assert.equal(normalized.listIndent, 0.75);
	assert.equal(normalized.paragraphGap, DEFAULT_THEME_LAYOUT_SETTINGS.paragraphGap);
});

test("layout settings clamp and snap invalid persisted values", () => {
	const normalized = normalizeThemeLayoutSettings({
		editorLineHeight: 9,
		readingLineHeight: "not-a-number",
		paragraphGap: 0.53,
		paragraphAfter: 0.13,
		firstLineIndent: -2,
		listLineHeight: 0.5,
		listItemSpacing: 0.13,
		listMarkerGap: 30,
		listBulletSize: 5.7,
		blockquoteIndent: 22.4,
	});

	assert.equal(normalized.editorLineHeight, 2.2);
	assert.equal(normalized.readingLineHeight, DEFAULT_THEME_LAYOUT_SETTINGS.readingLineHeight);
	assert.equal(normalized.paragraphGap, 0.55);
	assert.equal(normalized.paragraphAfter, 0.15);
	assert.equal(normalized.firstLineIndent, 0);
	assert.equal(normalized.listLineHeight, 1.2);
	assert.equal(normalized.listItemSpacing, 0.14);
	assert.equal(normalized.listMarkerGap, 18);
	assert.equal(normalized.listBulletSize, 5.5);
	assert.equal(normalized.blockquoteIndent, 22);
});

test("CSS variables carry the correct unit and stable decimal format", () => {
	const variables = themeLayoutCssVariables({
		editorLineHeight: 1.7,
		paragraphGap: 0.45,
		paragraphAfter: 0.5,
		listLineHeight: 1.65,
		listItemSpacing: 0.12,
		listMarkerGap: 11,
		listBulletSize: 6.5,
		blockquoteIndent: 24,
	});

	assert.equal(variables["--ncl-editor-line-height"], "1.7");
	assert.equal(variables["--ncl-paragraph-gap"], "0.45em");
	assert.equal(variables["--ncl-paragraph-after"], "0.5em");
	assert.equal(variables["--ncl-list-line-height"], "1.65");
	assert.equal(variables["--ncl-list-item-spacing"], "0.12em");
	assert.equal(variables["--ncl-list-marker-gap"], "11px");
	assert.equal(variables["--ncl-list-bullet-size"], "6.5px");
	assert.equal(variables["--ncl-blockquote-indent"], "24px");
	assert.equal(variables["--ncl-list-first-indent"], "0.72em");
	assert.equal(formatThemeLayoutValue("firstLineIndent", 1.5), "1.5em");
});

test("list hierarchy also derives a restrained first-level editor gutter", () => {
	assert.equal(themeLayoutCssVariables(null)["--ncl-list-first-indent"], "0.72em");
	assert.equal(themeLayoutCssVariables({ listIndent: 0.75 })["--ncl-list-first-indent"], "0.5em");
	assert.equal(themeLayoutCssVariables({ listIndent: 3.5 })["--ncl-list-first-indent"], "1.4em");
});

test("upgrading an existing layout adds width controls without changing saved values", () => {
	const previous = { ...DEFAULT_THEME_LAYOUT_SETTINGS, editorLineHeight: 1.95, listMarkerGap: 10, paragraphGap: 0.2 };
	delete previous.textMaxWidth;
	delete previous.pageSidePadding;
	const next = normalizeThemeLayoutSettings(previous);
	for (const [key, value] of Object.entries(previous)) assert.equal(next[key], value);
	assert.equal(next.textMaxWidth, 600);
	assert.equal(next.pageSidePadding, -1);
});

test("page width clamps and snaps to a supported range", () => {
	assert.equal(normalizeThemeLayoutSettings({ textMaxWidth: 0 }).textMaxWidth, 320);
	assert.equal(normalizeThemeLayoutSettings({ textMaxWidth: 5000 }).textMaxWidth, 1600);
	assert.equal(normalizeThemeLayoutSettings({ textMaxWidth: 873 }).textMaxWidth, 880);
	assert.equal(normalizeThemeLayoutSettings({ textMaxWidth: NaN }).textMaxWidth, 600);
});

test("automatic margins are distinct from a real zero-pixel inset", () => {
	assert.equal(normalizeThemeLayoutSettings({ pageSidePadding: -100 }).pageSidePadding, -1);
	assert.equal(normalizeThemeLayoutSettings({ pageSidePadding: 1000 }).pageSidePadding, 160);
	assert.equal(formatThemeLayoutValue("pageSidePadding", -1), "自动");
	assert.equal(formatThemeLayoutValue("pageSidePadding", 0), "0px");
	assert.equal(formatThemeLayoutValue("textMaxWidth", 1000), "1000px");
});

test("manual margins use pane-relative protection and automatic mode restores the CSS fallback", () => {
	assert.equal(themeLayoutCssVariables({ pageSidePadding: -1 })["--ncl-page-side-padding"], "initial");
	assert.equal(themeLayoutCssVariables({ pageSidePadding: 0 })["--ncl-page-side-padding"], "min(0px, 20%)");
	assert.equal(themeLayoutCssVariables({ pageSidePadding: 160 })["--ncl-page-side-padding"], "min(160px, 20%)");
	assert.equal(themeLayoutCssVariables({ textMaxWidth: 1000 })["--ncl-text-max-width"], "1000px");
});

test("width and margins survive save/reload without changing other layout settings", () => {
	const saved = normalizeThemeLayoutSettings({ textMaxWidth: 1040, pageSidePadding: 36, listMarkerGap: 18 });
	assert.deepEqual(normalizeThemeLayoutSettings(JSON.parse(JSON.stringify(saved))), saved);
	assert.equal(saved.listMarkerGap, 18);
});

test("reset removes manual width and margin overrides through the same variable set", () => {
	const manual = themeLayoutCssVariables({ textMaxWidth: 1200, pageSidePadding: 100 });
	const reset = themeLayoutCssVariables(DEFAULT_THEME_LAYOUT_SETTINGS);
	assert.deepEqual(Object.keys(reset), Object.keys(manual));
	assert.equal(reset["--ncl-text-max-width"], "600px");
	assert.equal(reset["--ncl-page-side-padding"], "initial");
});
