import { DEFAULT_THEME_LAYOUT_SETTINGS, formatThemeLayoutValue, normalizeThemeLayoutSettings, themeLayoutCssVariables } from "../../src/themeLayout";

const byId = (id: string): HTMLElement => document.getElementById(id)!;
const sample = "这是用来验证正文宽度的中英文段落。 Width and padding update together without rewriting Markdown or changing vertical spacing. ".repeat(4);
for (const mode of ["live", "source", "reading"]) {
	const pane = document.createElement("div");
	pane.className = "pane";
	pane.id = mode;
	const caption = document.createElement("div");
	caption.className = "caption";
	caption.textContent = `${mode} — isolated Obsidian-compatible layout fixture`;
	pane.append(caption);
	const content = document.createElement("div");
	content.className = "view-content";
	content.innerHTML = mode === "reading"
		? '<div class="markdown-reading-view"><div class="markdown-preview-view markdown-rendered is-readable-line-width"><div class="markdown-preview-sizer"><p></p></div></div></div>'
		: `<div class="markdown-source-view mod-cm6 is-readable-line-width ${mode === "live" ? "is-live-preview" : ""}"><div class="cm-editor"><div class="cm-scroller"><div class="cm-sizer"><div class="cm-content"><div class="cm-line"></div></div></div></div></div></div>`;
	content.querySelector(mode === "reading" ? "p" : ".cm-line")!.textContent = sample;
	const title = document.createElement("div");
	title.className = "inline-title";
	title.textContent = "秋季活动执行记录";
	content.querySelector(mode === "reading" ? ".markdown-preview-sizer" : ".cm-sizer")!.prepend(title);
	pane.append(content);
	byId("panes").append(pane);
}

let settings = { ...DEFAULT_THEME_LAYOUT_SETTINGS };
const widthControl = byId("width") as HTMLInputElement;
const paddingControl = byId("padding") as HTMLInputElement;
const apply = (): void => {
	settings = normalizeThemeLayoutSettings({ ...settings, textMaxWidth: Number(widthControl.value), pageSidePadding: Number(paddingControl.value) });
	for (const [name, value] of Object.entries(themeLayoutCssVariables(settings))) document.body.style.setProperty(name, value);
	byId("width-value").textContent = formatThemeLayoutValue("textMaxWidth", settings.textMaxWidth);
	byId("padding-value").textContent = formatThemeLayoutValue("pageSidePadding", settings.pageSidePadding);
};
widthControl.addEventListener("input", apply);
paddingControl.addEventListener("input", apply);
const select = (width: number, padding: number): void => {
	widthControl.value = String(width);
	paddingControl.value = String(padding);
	widthControl.dispatchEvent(new Event("input", { bubbles: true }));
};
const near = (actual: number, expected: number, message: string): void => {
	if (Math.abs(actual - expected) > 0.1) throw new Error(`${message}: ${actual} != ${expected}`);
};
const records: unknown[] = [];
const measure = (label: string, readable = true): void => {
	const rows = ["live", "source", "reading"].map(mode => {
		const pane = byId(mode);
		const surface = pane.querySelector<HTMLElement>(mode === "reading" ? ".markdown-preview-view" : ".cm-scroller")!;
		const inner = pane.querySelector<HTMLElement>(mode === "reading" ? ".markdown-preview-sizer" : ".cm-sizer")!;
		const style = getComputedStyle(surface);
		const left = Number.parseFloat(style.paddingLeft), right = Number.parseFloat(style.paddingRight);
		const auto = window.innerWidth <= 700 ? 18 : Math.max(24, Math.min(window.innerWidth * 0.05, 72));
		const expectedPadding = settings.pageSidePadding === -1 ? auto : Math.min(settings.pageSidePadding, pane.clientWidth * 0.2);
		near(left, expectedPadding, `${label}/${mode} left inset`);
		near(right, expectedPadding, `${label}/${mode} right inset`);
		const top = 30;
		near(Number.parseFloat(style.paddingTop), top, `${label}/${mode} compact top inset`);
		near(Number.parseFloat(getComputedStyle(inner).paddingTop), 0, `${label}/${mode} no second inset`);
		near(pane.querySelector(".inline-title")!.getBoundingClientRect().top - surface.getBoundingClientRect().top, top, `${label}/${mode} total title offset`);
		const expectedWidth = Math.min(readable ? settings.textMaxWidth : Infinity, surface.clientWidth - left - right);
		near(inner.getBoundingClientRect().width, expectedWidth, `${label}/${mode} content width`);
		return { mode, width: inner.getBoundingClientRect().width, left, right, top: style.paddingTop };
	});
	const preview = byId("preview").querySelector<HTMLElement>(".ncl-theme-layout-preview-canvas")!;
	const inner = preview.firstElementChild as HTMLElement;
	const style = getComputedStyle(preview);
	near(inner.getBoundingClientRect().width, Math.min(settings.textMaxWidth, preview.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)), `${label}/settings preview width`);
	records.push({ label, rows });
};

document.fonts.ready.then(() => {
	try {
		measure("theme-alone defaults");
		select(DEFAULT_THEME_LAYOUT_SETTINGS.textMaxWidth, -1); measure("plugin defaults");
		select(1000, 40); measure("live slider input");
		select(320, 0); measure("minimum width and zero inset");
		select(1600, 160); measure("maximum values");
		document.body.style.setProperty("--fixture-pane-width", "320px");
		measure("narrow-pane protection");
		document.body.style.setProperty("--fixture-pane-width", "1200px");
		select(320, 40);
		document.querySelectorAll(".is-readable-line-width").forEach(el => el.classList.remove("is-readable-line-width"));
		measure("native width limit disabled", false);
		document.querySelectorAll(".markdown-source-view, .markdown-preview-view").forEach(el => el.classList.add("is-readable-line-width"));
		select(DEFAULT_THEME_LAYOUT_SETTINGS.textMaxWidth, -1); measure("reset restores responsive padding");
		for (const key of Object.keys(themeLayoutCssVariables(settings))) document.body.style.removeProperty(key);
		measure("plugin unload restores theme defaults");
		byId("result").textContent = JSON.stringify(records, null, 2);
		document.body.dataset.result = "pass";
	} catch (error) {
		byId("result").textContent = error instanceof Error ? error.stack || error.message : String(error);
		document.body.dataset.result = "fail";
	}
});
