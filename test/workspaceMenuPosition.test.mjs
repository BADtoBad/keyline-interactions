import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceMenuPosition } from './.build/workspaceMenuPosition.js';

test('workspace menu is bottom anchored above the bar with a six pixel gap',()=>{
    const p=workspaceMenuPosition({left:0,right:1200,top:0,bottom:800,anchorX:600,anchorTop:776,viewportHeight:800});
    assert.deepEqual(p,{left:468,bottom:30,width:264,maxHeight:360});
});
test('short windows scroll above the bar instead of overflowing or flipping downward',()=>{
    const p=workspaceMenuPosition({left:18,right:342,top:18,bottom:260,anchorX:180,anchorTop:212,viewportHeight:278});
    assert.equal(p.maxHeight,180);assert.equal(278-p.bottom,206);
    assert.ok(p.left>=26&&p.left+p.width<=334);
});
test('menu stays in the app at either edge and at fractional zoom coordinates',()=>{
    for(const width of [200,340,650,1000,1500])for(const height of [140,260,700,990])for(const anchorX of [-50,0,width/2,width,width+50]){
        const p=workspaceMenuPosition({left:0.5,right:width-.5,top:.5,bottom:height-.5,anchorX,anchorTop:height-26.5,viewportHeight:height});
        const bottom=height-p.bottom;
        assert.ok(p.left>=8.5&&p.left+p.width<=width-8.5);
        assert.ok(bottom<=height-32.5&&bottom-p.maxHeight>=8.5);
    }
});
