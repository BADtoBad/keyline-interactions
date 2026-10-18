import test from "node:test";
import assert from "node:assert/strict";
import { GFM, parser } from "@lezer/markdown";
import {
	collectMarkdownSyntax,
	findSuspiciousMarkers,
	markdownMarkerKind,
	nextSuspiciousMarker,
} from "./.build/syntaxAnalysis.js";

const markdownParser = parser.configure(GFM);

function analyze(text) {
	const summary = collectMarkdownSyntax(markdownParser.parse(text), text);
	return {
		summary,
		hidden: summary.hidden.map(({ from, to }) => text.slice(from, to)),
		warnings: findSuspiciousMarkers(text, summary),
	};
}

test("conceals only parser-confirmed strong-emphasis markers", () => {
	const result = analyze("one **bold** two");
	assert.deepEqual(result.hidden, ["**", "**"]);
	assert.deepEqual(result.warnings, []);
});

test("recognises Obsidian token-class metadata for formatting markers", () => {
	assert.equal(markdownMarkerKind("Strong strong formatting formatting-strong"), "emphasis");
	assert.equal(markdownMarkerKind("Em em formatting formatting-em"), "emphasis");
	assert.equal(markdownMarkerKind("Strike formatting formatting-strikethrough"), "strikethrough");
	assert.equal(markdownMarkerKind("Code formatting formatting-code"), "code");
	assert.equal(markdownMarkerKind("Header header-2 formatting formatting-header"), "heading");
	assert.equal(markdownMarkerKind("Strong strong"), null);
});

test("conceals only complete inline-colour tags written by this plugin", () => {
	const own = '<span data-nmg-color="blue-text" style="color: var(--color-blue);">blue</span>';
	const ordinary = '<span style="color: red">red</span>';
	const result = analyze(`${own} ${ordinary}`);
	assert.deepEqual(result.hidden, [
		'<span data-nmg-color="blue-text" style="color: var(--color-blue);">',
		"</span>",
	]);
});

test("keeps an unmatched plugin colour opener visible", () => {
	const result = analyze('<span data-nmg-color="blue-text" style="color: var(--color-blue);">blue');
	assert.deepEqual(result.hidden, []);
});

test("keeps a rejected opener visible while concealing a later valid pair", () => {
	const text = '中文**"引文" and **later**';
	const result = analyze(text);
	assert.deepEqual(result.hidden, ["**", "**"]);
	assert.deepEqual(result.warnings.map((warning) => warning.marker), ["**"]);
	assert.equal(result.warnings[0].from, 2);
});

test("merges adjacent parser nodes for triple emphasis", () => {
	const result = analyze("***both***");
	assert.deepEqual(result.hidden, ["***", "***"]);
	assert.deepEqual(result.warnings, []);
});

test("inline code hides its backticks but treats interior underscores as data", () => {
	const result = analyze("`_VARIABLE_A_`");
	assert.deepEqual(result.hidden, ["`", "`"]);
	assert.deepEqual(result.warnings, []);
});

test("fenced code is neither concealed nor warned about", () => {
	const result = analyze("```md\n**literal** and `literal`\n```");
	assert.deepEqual(result.hidden, []);
	assert.deepEqual(result.warnings, []);
});

test("delimiter-like characters in link destinations are treated as data", () => {
	const result = analyze("[source](https://example.com/a__b)");
	assert.deepEqual(result.warnings, []);
});

test("a horizontal rule is not mistaken for broken emphasis", () => {
	const result = analyze("****");
	assert.deepEqual(result.hidden, []);
	assert.deepEqual(result.warnings, []);
});

test("GFM strikethrough markers are parser-confirmed", () => {
	const result = analyze("~~old~~");
	assert.deepEqual(result.hidden, ["~~", "~~"]);
	assert.deepEqual(result.warnings, []);
});

test("an unmatched backtick remains visible and gets a warning", () => {
	const result = analyze("before ` after");
	assert.deepEqual(result.hidden, []);
	assert.equal(result.warnings.length, 1);
	assert.equal(result.warnings[0].marker, "`");
});

test("ATX headings conceal only the parser-confirmed header mark", () => {
	const result = analyze("## Heading");
	assert.deepEqual(result.hidden, ["##"]);
	assert.deepEqual(result.warnings, []);
});

test("parser-confirmed escapes conceal only the backslash", () => {
	const result = analyze("1\\. item and \\*literal\\*");
	assert.deepEqual(result.hidden, ["\\", "\\", "\\"]);
	assert.deepEqual(result.warnings, []);
});

test("ordinary backslashes remain visible when the parser did not accept an escape", () => {
	const result = analyze("C:\\Users and trailing \\");
	assert.deepEqual(result.hidden, []);
	assert.deepEqual(result.warnings, []);
});

test("next-warning navigation wraps around the document", () => {
	const warnings = [
		{ from: 3, to: 5, marker: "**", message: "first" },
		{ from: 12, to: 14, marker: "**", message: "second" },
	];
	assert.equal(nextSuspiciousMarker(warnings, 4)?.from, 12);
	assert.equal(nextSuspiciousMarker(warnings, 14)?.from, 3);
	assert.equal(nextSuspiciousMarker([], 0), null);
});
