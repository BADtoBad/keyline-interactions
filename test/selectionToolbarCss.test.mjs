import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/selectionToolbar.ts", import.meta.url), "utf8");

test("Make.md Inline Styler is hidden only under the reversible toolbar class", () => {
	assert.match(
		css,
		/body\.nmg-selection-toolbar-enabled \.mk-style-menu\s*\{/u
	);
	assert.doesNotMatch(css, /(?:^|\n)\.mk-style-menu\s*\{/u);
});

test("the selected-text toolbar uses CodeMirror placement rather than a body-fixed overlay", () => {
	assert.match(source, /showTooltip\.from\(/u);
	assert.doesNotMatch(
		css,
		/\.nmg-selection-toolbar\s*\{[^}]*position:\s*fixed/isu
	);
	assert.match(css, /\.cm-editor:not\(\.cm-focused\) \.nmg-selection-toolbar/u);
	assert.match(css, /\.cm-tooltip:has\(> \.nmg-selection-toolbar\)/u);
	assert.match(css, /--nmg-toolbar-bg/u);
	assert.match(source, /snapshotToolbarTheme\(themeSource, this\.dom\)/u);
	assert.match(source, /getComputedStyle\(source\)/u);
});

test("selection entry points reuse the complete Notion block action menu", () => {
	assert.match(source, /showNotionBlockActionMenu\(/u);
	assert.doesNotMatch(source, /new Menu\(/u);
});

test('direct marginalia buttons delegate to the optional standalone provider', () => {
  assert.match(source, /\['sidenote', 'text-quote'/u);
  assert.match(source, /\['marginnote', 'panel-right'/u);
  assert.match(source, /marginaliaProvider\(this\.plugin\)\?\.insertFromView\(this\.view, kind\)/u);
  assert.doesNotMatch(source, /planMarginInsertion|dispatchBlockEdit/u);
  assert.match(source, /button\.disabled = !!reason/u);
  assert.match(source, /button\.title = reason/u);
});

test('CodeMirror adding its tooltip class to our root must not erase the surface', () => {
  assert.doesNotMatch(css, /\.cm-tooltip\.nmg-selection-toolbar\s*\{[^}]*background:\s*transparent/isu);
  assert.match(css, /--nmg-toolbar-shadow, var\(--ncl-surface-shadow\)/u);
  assert.match(source, /--ncl-toolbar-shadow/u);
});

test('keyboard focus retains the toolbar and Escape dismisses without deleting selection', () => {
  assert.match(css, /\.nmg-selection-toolbar:not\(:focus-within\)/u);
  assert.match(source, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/u);
  assert.match(source, /dismissSelectionToolbar\.of\(null\)/u);
});

test('rendered callouts cancel the core hanging indent after hiding quote markers', () => {
  assert.match(css, /\.ncl-styled-callout-line\s*\{[^}]*padding-inline:\s*14px\s*!important;[^}]*text-indent:\s*0\s*!important;/su);
});
