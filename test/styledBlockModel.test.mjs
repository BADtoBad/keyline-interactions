import test from "node:test";
import assert from "node:assert/strict";
import { planStyledBlocks } from "./.build/styledBlockModel.js";

test("callout headers and body lines form one editable visual block", () => {
	const text = "> [!info]\n> 第一行\n> 第二行\n\n正文";
	const plan = planStyledBlocks(text);

	assert.equal(plan.length, 3);
	assert.deepEqual(
		plan.map(({ kind, lineNumber, isFirst, isLast, calloutType }) => ({
			kind,
			lineNumber,
			isFirst,
			isLast,
			calloutType,
		})),
		[
			{ kind: "callout", lineNumber: 1, isFirst: true, isLast: false, calloutType: "info" },
			{ kind: "callout", lineNumber: 2, isFirst: false, isLast: false, calloutType: "info" },
			{ kind: "callout", lineNumber: 3, isFirst: false, isLast: true, calloutType: "info" },
		]
	);
	assert.equal(text.slice(plan[0].markerFrom, plan[0].markerTo), "> ");
	assert.equal(text.slice(plan[0].headerFrom, plan[0].headerTo), "[!info]");
	assert.equal(plan[0].hasExplicitTitle, false);
});

test("an explicit callout title remains editable after its source token is hidden", () => {
	const text = "> [!warning]- 请注意\n> 内容";
	const [header] = planStyledBlocks(text);

	assert.equal(header.calloutType, "warning");
	assert.equal(header.hasExplicitTitle, true);
	assert.equal(text.slice(header.headerFrom, header.headerTo), "[!warning]- ");
	assert.equal(text.slice(header.headerTo, text.indexOf("\n")), "请注意");
});

test("plain quote markers are planned without changing the quoted text", () => {
	const text = ">第一行\n> 第二行";
	const plan = planStyledBlocks(text);

	assert.equal(plan.length, 2);
	assert.equal(plan[0].kind, "quote");
	assert.equal(plan[0].isFirst, true);
	assert.equal(plan[1].isLast, true);
	assert.equal(text.slice(plan[0].markerTo, plan[0].lineTo), "第一行");
	assert.equal(text.slice(plan[1].markerTo, plan[1].lineTo), "第二行");
});

test("a quote immediately after a list is still a new styled block", () => {
	const text = "- 第一项\n- 第二项\n> 新的 Quote";
	const plan = planStyledBlocks(text);

	assert.equal(plan.length, 1);
	assert.equal(plan[0].lineNumber, 3);
	assert.equal(plan[0].isFirst, true);
	assert.equal(plan[0].isLast, true);
	assert.equal(text.slice(plan[0].markerTo, plan[0].lineTo), "新的 Quote");
});

test("ordinary extra quote padding is hidden consistently without rewriting source", () => {
	const text = ">  第一行\n>  第二行\n>  第三行";
	const plan = planStyledBlocks(text);

	assert.equal(plan.length, 3);
	for (const line of plan) {
		assert.equal(text.slice(line.markerFrom, line.markerTo), ">  ");
		assert.equal(text.slice(line.markerTo, line.lineTo).startsWith("第"), true);
	}
	assert.equal(text, ">  第一行\n>  第二行\n>  第三行");
});

test("code-significant quote indentation stays visible", () => {
	const text = ">     const value = 1";
	const [line] = planStyledBlocks(text);

	assert.equal(text.slice(line.markerFrom, line.markerTo), "> ");
	assert.equal(text.slice(line.markerTo, line.lineTo), "    const value = 1");
});

test("a callout header starts a new block after an adjacent plain quote", () => {
	const plan = planStyledBlocks("> 引用\n> [!tip]\n> 提示");

	assert.equal(plan.length, 3);
	assert.equal(plan[0].kind, "quote");
	assert.equal(plan[0].isFirst, true);
	assert.equal(plan[0].isLast, true);
	assert.equal(plan[1].kind, "callout");
	assert.equal(plan[1].isFirst, true);
	assert.equal(plan[2].isLast, true);
});

test("nested and malformed quote syntax fails closed", () => {
	const plan = planStyledBlocks(">> 嵌套\n> [!info\n普通正文");

	assert.equal(plan.length, 1);
	assert.equal(plan[0].kind, "quote");
	assert.equal(plan[0].lineNumber, 2);
	assert.equal(plan[0].headerFrom, undefined);
});
