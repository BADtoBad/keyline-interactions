import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { blockHandlesExtension } from "../../src/blockHandles";

// Only Obsidian's DOM helpers/API boundary are shimmed. Geometry, hover,
// folding detection and caret coordinates run the shipped plugin and CM6.
const proto = HTMLElement.prototype as any;
proto.createDiv = function(options: any = {}) {
  const el = document.createElement("div");
  el.className = typeof options === "string" ? options : options.cls || "";
  for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, String(value));
  this.append(el); return el;
};
proto.setCssStyles = function(styles: any) { Object.assign(this.style, styles); };
proto.toggle = function(shown: boolean) { this.style.display = shown ? "" : "none"; };
const plugin: any = { settings: { plusHandle: true, foldHandle: true, handleSide: "left", handleAlwaysVisible: false } };
const extension = blockHandlesExtension(plugin);
const view = new EditorView({
  state: EditorState.create({ doc: "# 可折叠标题\n普通段落\n" + "正文用于滚动验证。\n".repeat(100), extensions: [extension] }),
  parent: document.querySelector(".markdown-source-view")!,
});
const sizer = document.createElement("div");
sizer.className = "cm-sizer";
view.contentDOM.before(sizer); sizer.append(view.contentDOM);
const title = document.createElement("div");
title.className = "inline-title"; title.textContent = "秋季活动执行记录"; sizer.prepend(title);
const controller: any = view.plugin(extension)!;
const near = (a: number, b: number, name: string) => { if (Math.abs(a - b) > 0.6) throw Error(`${name}: ${a} != ${b}`); };
const wait = () => new Promise(resolve => setTimeout(resolve, 80));
const rect = (el: HTMLElement) => el.getBoundingClientRect();
const mount = document.querySelector<HTMLElement>("#pane")!;
(window as any).editorFixture = {
  view,
  async check() {
    const records = [];
    // Includes the zero offsetParent regression: .cm-content is inside a
    // positioned .cm-sizer, not directly inside the scroller.
    for (const [name, padding, width, line, side, plus, expectedSize] of [
      ["paragraph-left", 72, 920, 2, "left", true, 28],
      ["fold-left", 72, 920, 1, "left", true, 20],
      ["fold-plus-off", 72, 920, 1, "left", false, 28],
      ["paragraph-right", 72, 920, 2, "right", true, 28],
      ["split-pane", 50, 360, 2, "left", true, 20],
      ["no-room", 0, 360, 2, "left", true, null],
      ["resize-restored", 72, 920, 2, "left", true, 28],
    ] as const) {
      mount.style.width = `${width}px`;
      document.body.style.setProperty("--ncl-page-side-padding", `${padding}px`);
      plugin.settings.handleSide = side; plugin.settings.plusHandle = plus;
      view.scrollDOM.scrollTop = 0; view.requestMeasure(); await wait();
      controller.invalidateMetrics(); controller.hoveredLine = line;
      const shown = controller.updatePosition(view);
      const row = controller.handleEl as HTMLElement;
      if (expectedSize === null) {
        if (shown || !row.classList.contains("is-hidden") || getComputedStyle(row).pointerEvents !== "none") throw Error(`hidden row intercepts text: ${JSON.stringify({shown,cls:row.className,pointer:getComputedStyle(row).pointerEvents,metrics:controller.readMetrics(view),sizer:rect(sizer),content:rect(view.contentDOM)})}`);
      } else {
        if (!shown) throw Error(`${name}: placement failed`);
        row.classList.remove("is-hidden");
        const r = rect(row), c = rect(view.contentDOM), s = rect(view.scrollDOM);
        near(rect(controller.dragButton).width, expectedSize, `${name} button width`);
        if (r.left < s.left + 3.5 || r.right > s.right - 3.5) throw Error(`${name}: row outside scroller`);
        if (!(r.right <= c.left - 3.5 || r.left >= c.right + 3.5)) throw Error(`${name}: row overlaps text`);
        const coords = view.coordsAtPos(view.state.doc.line(line).from)!;
        near((r.top + r.bottom) / 2, (coords.top + coords.bottom) / 2, `${name} vertical center`);
        if (!row.contains(document.elementFromPoint(r.left + r.width/2, r.top + r.height/2))) throw Error(`${name}: hit target covered`);
      }
      near(rect(title).top - rect(view.scrollDOM).top, 30, `${name} title top inset`);
      if (getComputedStyle(view.scrollDOM).getPropertyValue("scrollbar-width") !== "none") throw Error("editor scrollbar not hidden");
      records.push({name, shown, width:rect(row).width, titleTop:rect(title).top-rect(view.scrollDOM).top, offsetLeft:view.contentDOM.offsetLeft});
    }
    // Real mouse movement enters the scroller, then can reach the + control.
    controller.hideHandle();
    return records;
  },
  hoverPoint() { const c = view.coordsAtPos(view.state.doc.line(2).from)!; return {x:c.left+10,y:(c.top+c.bottom)/2}; },
  buttonPoint() { const r=rect(controller.addButton); return {x:r.left+r.width/2,y:r.top+r.height/2,visible:!controller.handleEl.classList.contains("is-hidden")}; },
  async reading() {
    view.dom.parentElement!.style.display = "none";
    document.querySelector<HTMLElement>(".markdown-reading-view")!.style.display = "block";
    await wait();
    const surface=document.querySelector<HTMLElement>(".markdown-preview-view")!;
    const heading=surface.querySelector<HTMLElement>(".inline-title")!;
    near(rect(heading).top-rect(surface).top,30,"reading title top inset");
    if(getComputedStyle(surface).getPropertyValue("scrollbar-width")!=="none") throw Error("reading scrollbar not hidden");
    const r=rect(surface); return {x:r.left+r.width/2,y:r.top+150};
  },
};
document.body.dataset.ready = "true";
