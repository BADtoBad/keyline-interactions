import assert from 'node:assert/strict';
import test from 'node:test';

test('workspace names reject every ASCII control character', () => {
    for (const code of [...Array.from({ length: 32 }, (_, i) => i), 127]) {
        assert.ok(validateWorkspaceName(`layout${String.fromCharCode(code)}name`), String(code));
    }
});
import { WorkspaceLayouts, alternatingRecoveryStore, cloneLayout, readRecovery, validateWorkspaceName, workspaceSlot } from './.build/workspaceLayouts.js';

const copy = value => JSON.parse(JSON.stringify(value));
const layout = name => ({ main: { type: 'split', children: [{type:'leaf',state:{type:'markdown',state:{file:`${name}.md`}}}] }, left: {type:'tabs'}, unknownPluginState: {value:42} });
function fixture() {
    const f = { current: layout('临时现场'), backup: null, calls: [], enabled: true, conflict: false };
    f.core = { activeWorkspace: '阅读', workspaces: { 阅读: layout('阅读'), 写作: layout('写作') },
        async saveData() { f.calls.push('save'); if (f.failSave) { f.failSave--; throw Error('fail'); } } };
    f.store = { async read() {return copy(f.backup);}, async write(value) {
        f.calls.push('backup'); if (f.waitBackup) await f.waitBackup;
        if (f.failBackup) throw Error('backup failed'); f.backup = copy(value);
    } };
    f.host = {core:()=>f.enabled?f.core:null, conflict:()=>f.conflict, getLayout:()=>f.current,
        async changeLayout(value) { f.calls.push('load'); if (f.waitLoad) await f.waitLoad; if (f.failLoad) { f.failLoad--; throw Error('fail'); } f.current=value; }
    };
    f.service = new WorkspaceLayouts(f.host, f.store); return f;
}
test('construction and read do not save or restore a layout', async()=>{
    const f=fixture(); assert.equal(await f.service.recovery(),null); assert.deepEqual(f.calls,[]);
});
test('switch preserves named layouts, captures unsaved scene and awaits native restore', async()=>{
    const f=fixture(), named=copy(f.core.workspaces), before=copy(f.current);
    let release; f.waitLoad=new Promise(r=>release=r);
    const pending=f.service.switchTo('写作'); await new Promise(r=>setImmediate(r));
    assert.equal(f.core.activeWorkspace,'阅读'); assert.equal(f.service.busy,true);
    assert.deepEqual(f.calls,['backup','load']); release(); await pending;
    assert.deepEqual(f.backup.layout,before); assert.equal(f.core.activeWorkspace,'写作');
    assert.deepEqual(f.core.workspaces,named); assert.equal(f.service.busy,false);
    f.current.main.children=[]; assert.deepEqual(f.core.workspaces,named,'native restore must receive a clone');
});
test('restore swaps the scene without overwriting named layouts', async()=>{
    const f=fixture(), before=copy(f.current); await f.service.switchTo('写作'); await f.service.restore();
    assert.deepEqual(f.current,before); assert.equal(f.core.activeWorkspace,'阅读');
    await f.service.restore(); assert.deepEqual(f.current,layout('写作'));
});
test('backup failure prevents switching', async()=>{
    const f=fixture(); f.failBackup=true; await assert.rejects(f.service.switchTo('写作'),/backup/);
    assert.deepEqual(f.calls,['backup']); assert.equal(f.core.activeWorkspace,'阅读');
});
for(const failure of ['failLoad','failSave']) test(`${failure} rolls back scene and active name`,async()=>{
    const f=fixture(), before=copy(f.current); f[failure]=1;
    await assert.rejects(f.service.switchTo('写作'),/已恢复/);
    assert.deepEqual(f.current,before); assert.equal(f.core.activeWorkspace,'阅读'); assert.deepEqual(f.backup.layout,before);
});
test('rollback failure keeps recovery and reports actionable failure',async()=>{
    const f=fixture(); f.failLoad=2; await assert.rejects(f.service.switchTo('写作'),/备份已保留/); assert.ok(f.backup);
});
test('parallel operations are rejected, lock released after completion',async()=>{
    const f=fixture(); let release; f.waitBackup=new Promise(r=>release=r); const pending=f.service.switchTo('写作');
    await assert.rejects(f.service.save('新建',false),/进行中/); await assert.rejects(f.service.switchTo('阅读'),/进行中/);
    release(); await pending; assert.equal(f.service.busy,false);
});
for(const scenario of ['disabled','conflict','stopped','missing','malformed']) test(`fail closed: ${scenario}`, async()=>{
    const f=fixture(); if(scenario==='disabled')f.enabled=false; if(scenario==='conflict')f.conflict=true;
    if(scenario==='stopped')f.service.stop(); if(scenario==='malformed')f.core.workspaces['写作']={};
    await assert.rejects(f.service.switchTo(scenario==='missing'?'不存在':'写作')); assert.deepEqual(f.calls,[]);
});
test('disabling during backup cannot start a layout restore',async()=>{
    const f=fixture(); let release; f.waitBackup=new Promise(r=>release=r); const p=f.service.switchTo('写作'); f.service.stop(); release();
    await assert.rejects(p,/关闭/); assert.deepEqual(f.calls,['backup']);
});
test('deleted or replaced target during backup cannot start a layout restore',async()=>{
    for(const replace of [false,true]) {
        const f=fixture(); let release; f.waitBackup=new Promise(r=>release=r);
        const pending=f.service.switchTo('写作');
        if(replace)f.core.workspaces['写作']=layout('其他'); else delete f.core.workspaces['写作'];
        release(); await assert.rejects(pending,/已变化/); assert.deepEqual(f.calls,['backup']);
    }
});
test('native management is prepared with a recovery snapshot but no named save or load',async()=>{
    const f=fixture(), before=copy(f.current), names=copy(f.core.workspaces);
    assert.equal(await f.service.prepareManagement(),f.core);
    assert.deepEqual(f.backup.layout,before); assert.deepEqual(f.calls,['backup']);
    assert.deepEqual(f.core.workspaces,names);
    f.failBackup=true; await assert.rejects(f.service.prepareManagement(),/backup/);
});
test('save-as captures current scene, does not change view, rejects duplicates',async()=>{
    const f=fixture(), old=copy(f.core.workspaces); await f.service.save('  研究  ',false);
    assert.equal(f.core.activeWorkspace,'研究'); assert.deepEqual(f.core.workspaces['研究'].main,f.current.main);
    assert.deepEqual(f.core.workspaces['阅读'],old['阅读']); assert.deepEqual(f.calls,['save']);
    await assert.rejects(f.service.save('研究',false),/同名/);
});
test('explicit save-current only overwrites the active named layout',async()=>{
    const f=fixture(); await assert.rejects(f.service.save('写作',true),/变化/); await f.service.save('阅读',true);
    assert.deepEqual(f.core.workspaces['阅读'].main,f.current.main); assert.deepEqual(f.core.workspaces['写作'],layout('写作'));
});
test('failed save-as and save-current restore previous in-memory state',async()=>{
    const f=fixture(), before=copy(f.core.workspaces);
    for(const [name,overwrite] of [['新建',false],['阅读',true]]){ f.failSave=1; await assert.rejects(f.service.save(name,overwrite)); assert.deepEqual(f.core.workspaces,before); assert.equal(f.core.activeWorkspace,'阅读'); }
});
test('restoring deleted source name uses unnamed scene instead of false active name',async()=>{
    const f=fixture(); await f.service.switchTo('写作'); delete f.core.workspaces['阅读']; await f.service.restore(); assert.equal(f.core.activeWorkspace,'');
});
test('names are text, not property access or paths',()=>{
    for(const name of ['研究/写作','<script>','布局 📚'])assert.equal(validateWorkspaceName(name),null);
    for(const name of ['', '  ', '__proto__','constructor','prototype','hasOwnProperty','toString','a\nb'])assert.ok(validateWorkspaceName(name));
});
test('invalid recovery and non-serializable layouts fail closed',()=>{
    assert.throws(()=>readRecovery('{}')); assert.throws(()=>readRecovery(JSON.stringify({version:1,active:'阅读',savedAt:'bad',layout:layout('阅读')})));
    const cycle=layout('a'); cycle.cycle=cycle; assert.throws(()=>cloneLayout(cycle));
});
test('centre planner stays balanced, shrinks and wraps instead of overlapping',()=>{
    assert.deepEqual(workspaceSlot(1000,120,800,false),{width:180,separateRow:false,iconOnly:false});
    assert.deepEqual(workspaceSlot(1000,120,530,false),{width:36,separateRow:false,iconOnly:true});
    assert.equal(workspaceSlot(500,250,300,false).separateRow,true);
    assert.equal(workspaceSlot(1000,0,1000,true).separateRow,true);
});
function diskFixture(){const files=new Map();return {files,exists:async p=>files.has(p),read:async p=>files.get(p),write:async(p,v)=>{files.set(p,v);}};}
test('alternating slots preserve prior recovery and choose newest even in same millisecond',async()=>{
    const disk=diskFixture(), store=alternatingRecoveryStore(disk,'private');
    assert.equal(await store.read(),null);
    for(let i=0;i<5;i++)await store.write({version:1,savedAt:new Date().toISOString(),active:'阅读',layout:layout(String(i))});
    assert.equal(disk.files.size,2); assert.deepEqual((await store.read()).layout,layout('4'));
    const newest=[...disk.files.entries()].sort((a,b)=>JSON.parse(b[1]).savedAt.localeCompare(JSON.parse(a[1]).savedAt))[0][0];
    disk.files.set(newest,'{truncated'); assert.deepEqual((await store.read()).layout,layout('3'));
});
test('backup read-after-write verification fails on silent partial writes',async()=>{
    const disk=diskFixture(), store=alternatingRecoveryStore(disk,'private'); disk.write=async(p,v)=>disk.files.set(p,v.slice(0,10));
    await assert.rejects(store.write({version:1,savedAt:new Date().toISOString(),active:'',layout:layout('a')}),/校验失败/);
});
