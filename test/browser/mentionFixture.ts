import {Compartment, EditorState, EditorSelection} from '@codemirror/state';
import {EditorView, keymap} from '@codemirror/view';
import {history, undo, redo, defaultKeymap} from '@codemirror/commands';
import {Language, defineLanguageFacet} from '@codemirror/language';
import {parser} from '@lezer/markdown';
import {editorInfoField, TFile} from 'obsidian';
import {mentionMenuExtension} from '../../src/mentionMenu';
import {wikilinkInputExtension} from '../../src/wikilinkInput';
import {FloatingSurfaceCoordinator} from '../../src/surfaceCoordinator';

const w = window as any;
w.notices=[]; w.linkCalls=[]; w.scans=0;
const makeFile=(path:string,mtime:number)=>Object.assign(new TFile(),{path,basename:path.split('/').pop()!.replace(/\.md$/,''),extension:'md',stat:{mtime}});
const initialFiles = ['Work/AI Tech Stack.md','Life/Project.md','Work/Project.md','工作/项目 甲.md','工作/很长的页面名称用来测试窄窗口显示与文件夹消歧.md'];
let files=initialFiles.map((p,i)=>makeFile(p,100-i));
const plugin:any={settings:{enabled:true,wikilinkInputAliases:true,dateFormat:'YYYY-MM-DD',timeFormat:'HH:mm'},surfaceCoordinator:new FloatingSurfaceCoordinator(),app:{
  vault:{getMarkdownFiles:()=>{w.scans++;return files;},getAbstractFileByPath:(path:string)=>files.find(f=>f.path===path)},
  metadataCache:{fileToLinktext:(file:TFile,source:string)=>{w.linkCalls.push({target:file.path,source});return file.path.replace(/\.md$/,'');}},
  workspace:{getActiveFile:()=>({path:'WRONG/active-file.md'})},
}};
let view:EditorView, compartment:Compartment;
w.fixture={
 mount(text='',options:any={}) {
  plugin.surfaceCoordinator.closeAll(); view?.destroy();
  files=initialFiles.map((p,i)=>makeFile(p,100-i)); w.scans=0;w.linkCalls=[];w.notices=[];
  plugin.settings.enabled=options.enabled!==false;plugin.settings.wikilinkInputAliases=options.aliases!==false;
  compartment=new Compartment();
  const info=(editorInfoField as any).init(()=>({file:{path:options.source||'Journal/2026-09-12.md'}}));
  view=new EditorView({parent:document.getElementById('editor')!,state:EditorState.create({doc:text,selection:{anchor:text.length},extensions:[
   new Language(defineLanguageFacet(),parser),info,history(),keymap.of(defaultKeymap),EditorView.lineWrapping,
   EditorState.allowMultipleSelections.of(true),EditorState.readOnly.of(options.readOnly||false),
   compartment.of([wikilinkInputExtension(plugin),mentionMenuExtension(plugin)]),
  ]})});view.focus();
 },
 read(){return {text:view.state.doc.toString(),head:view.state.selection.main.head,menus:document.querySelectorAll('.ncl-mention-menu').length,scans:w.scans,linkCalls:w.linkCalls,notices:w.notices,hasFocus:view.hasFocus,active:view.contentDOM.getAttribute('aria-activedescendant')};},
 type(text:string,event='input.type'){const s=view.state.selection.main;view.dispatch({changes:{from:s.from,to:s.to,insert:text},selection:{anchor:s.from+text.length},userEvent:event});},
 insertBefore(){view.dispatch({changes:{from:0,insert:'外部更改'},userEvent:'input.external'});},
 cursor(pos:number){view.dispatch({selection:{anchor:pos}});},
 selectAll(){view.dispatch({selection:{anchor:0,head:view.state.doc.length}});},
 multi(){view.dispatch({selection:EditorSelection.create([EditorSelection.cursor(0),EditorSelection.cursor(view.state.doc.length)])});},
 deleteTarget(){files=files.filter(f=>f.path!=='Work/AI Tech Stack.md');},
 undo(){undo(view);}, redo(){redo(view);},
 unload(){view.dispatch({effects:compartment.reconfigure([])});},
 disable(){plugin.settings.wikilinkInputAliases=false;view.dispatch({});},
 replaceSurface(){plugin.surfaceCoordinator.claim(document,'action-menu',()=>{});},
 destroy(){view.destroy();plugin.surfaceCoordinator.closeAll();},
 composing(active:boolean){view.contentDOM.dispatchEvent(new CompositionEvent(active?'compositionstart':'compositionend',{bubbles:true}));},
 format(date:string,time:string){plugin.settings.dateFormat=date;plugin.settings.timeFormat=time;},
};
w.fixture.mount(); w.ready=true;
