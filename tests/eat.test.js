import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { updateEating } from '../src/game/eat.js';
import { buildWorld } from '../src/world/build.js';
import { Field } from '../src/world/field.js';
import { Rigid } from '../src/game/rigid.js';
import { Sculpt } from '../src/world/voxel.js';
import { buildSculpt } from '../src/world/sculpts.js';
import { THEMES } from '../src/world/themes.js';
import { makeRng } from '../src/core/rng.js';

const canvasContext = new Proxy({}, { get: (target,key) => target[key]
  ?? (key==='createRadialGradient' ? ()=>({addColorStop(){}}) : ()=>{}) });
globalThis.document = {createElement:()=>({getContext:()=>canvasContext})};
await Rigid.init();
const scene=new THREE.Scene();
const rigid=new Rigid(scene);
const fields={cube:new Field(scene,40000),bead:new Field(scene,16000,{shape:'bead'})};
test.afterEach(()=>rigid.reset());
test.after(()=>rigid.world.free());

function blocks(positions) {
  const s=new Sculpt();
  for (const [x,y,z] of positions) s.paint(x,y,z,'#ff8844');
  return s.build({kind:'test'});
}
function setup(model,{x=0,z=0,r=1.05,yaw=0}={}) {
  let credited=0;
  const prop={x,z,yaw,model,need:100};
  const level={props:[prop],tiles:[],board:{w:220,d:220}};
  buildWorld(level,fields,rigid);
  rigid.onConsumed=()=>credited++;
  const ctx={level,fields,rigid,hole:{state:{x:0,z:0,r}},magnet:0,
    audio:{pop(){},rumble(){},boom(){}},fx:{shake(){}},debris:{spawn(){}},consume(){throw Error('scripted credit');}};
  const step=(frames=1)=>{for(let i=0;i<frames;i++){updateEating(1/60,ctx);rigid.update(1/60,ctx.hole.state);fields.cube.flush();fields.bead.flush();}};
  return {prop,ctx,step,credited:()=>credited};
}

test('a hole undermines one column while the supported column stays standing',()=>{
  const model=blocks([[0,0,0],[0,1,0],[0,2,0],[4,0,0],[4,1,0],[4,2,0]]);
  const {prop,step,credited}=setup(model);
  step(240);
  assert.equal(credited(),3);
  assert.equal(prop.remaining,3);
  assert.notEqual(prop.state,'gone');
  for(const b of rigid.propVoxels){
    assert.ok(Math.abs(b.px-4)<0.1);
    assert.ok(b.body.translation().y>0);
  }
});

test('gravity drops an unsupported block progressively instead of sinking the whole prop',()=>{
  const {prop,step,credited}=setup(blocks([[0,0,0],[0,1,0],[0,2,0]]));
  const top=[...rigid.propVoxels].find(b=>b.y===2.5);
  step(1);
  assert.equal(credited(),0);
  assert.equal(prop.remaining,3);
  assert.ok(top.body.translation().y>2);
  step(30);
  assert.ok(top.body.translation().y<2.4);
  step(210);
  assert.equal(prop.remaining,0);
  assert.equal(prop.state,'gone');
  assert.equal(credited(),3);
});

test('unsupported blocks fall onto the board and remain collectible where they land',()=>{
  const {ctx,step,credited}=setup(blocks([[2,3,0]]),{r:1.2});
  const b=[...rigid.propVoxels][0];
  step(120);
  assert.equal(credited(),0);
  assert.ok(b.body.translation().y>0.4 && b.body.translation().y<0.7);
  assert.ok(Math.abs(b.px-2)<0.2);
  ctx.hole.state.x=2;
  step(180);
  assert.equal(credited(),1);
});

test('moving the hole away does not drag the rest of a structure after it',()=>{
  const {ctx,step}=setup(blocks([[0,0,0],[0,1,0],[4,0,0],[4,1,0]]));
  step(8);
  ctx.hole.state.x=25;
  step(120);
  assert.ok(rigid.propVoxels.size>0);
  for(const b of rigid.propVoxels) assert.ok(b.px<6,'no scripted following');
});

test('a magnet applies an impulse to blocks without teleporting the parent structure',()=>{
  const {prop,ctx}=setup(blocks([[0,0,0]]),{x:4});
  const b=[...rigid.propVoxels][0];
  rigid.magnet(ctx.hole.state,8,0.1);
  assert.ok(b.body.linvel().x<0);
  assert.equal(prop.x,4);
  assert.equal(b.body.translation().x,4);
});

test('all themed structure shapes register every block without exceeding debris caps',()=>{
  let shapes=0;
  for(const theme of THEMES) for(const kind of new Set(theme.spawn.map(s=>s[0]))){
    const model=buildSculpt(kind,makeRng(12345),theme.P);
    if(model.bomb || !model.count) continue;
    const {prop}=setup(model,{x:60,z:60,yaw:Math.PI/2});
    assert.equal(rigid.propVoxels.size,model.count,kind);
    assert.equal(prop.remaining,model.count);
    assert.equal(rigid.nLive,0);
    assert.equal(rigid.layers[0].bodies.length,0,'props do not evict limited debris slots');
    for(const b of rigid.propVoxels) assert.ok(Number.isFinite(b.x+b.y+b.z));
    shapes++;
  }
  assert.ok(shapes>20);
});

test('streaming a settled block preserves its pose and original voxel instance',()=>{
  const {ctx,step}=setup(blocks([[2,3,0]]),{r:1.2});
  const b=[...rigid.propVoxels][0];
  step(180);
  const p={...b.body.translation()},q={...b.body.rotation()};
  b.body.sleep(); b.asleep=true;
  const ref=b.ref,part=b.part;
  ctx.hole.state.x=50; step(1);
  assert.equal(b.body,null);
  ctx.hole.state.x=0;
  rigid.update(0,ctx.hole.state);
  assert.ok(b.body);
  assert.deepEqual({...b.body.translation()},p);
  assert.deepEqual({...b.body.rotation()},q);
  assert.equal(b.ref,ref); assert.equal(b.part,part);
});

test('streamed physics preserves the original rotated voxel appearance',()=>{
  const {ctx}=setup(blocks([[0,0,0],[1,0,0],[0,1,0]]),{x:4,yaw:Math.PI/2});
  const before=fields.cube.mesh.instanceMatrix.array.slice(0,48);
  rigid.update(0,ctx.hole.state);
  for(const b of rigid.propVoxels) rigid._writeSlot(null,b);
  const after=fields.cube.mesh.instanceMatrix.array.slice(0,48);
  for(let i=0;i<48;i++) assert.ok(Math.abs(before[i]-after[i])<1e-6);
});

test('a full free-play board keeps distant structures dormant and retains every block',async()=>{
  const {generateFreeMap}=await import('../src/levels/freeplay.js');
  const level=generateFreeMap({seed:12345,theme:THEMES[0]});
  buildWorld(level,fields,rigid);
  rigid.onConsumed=()=>{};
  const total=level.props.reduce((n,p)=>n+p.model.count,0);
  assert.equal(rigid.propVoxels.size,total);
  assert.ok(total>10000);
  rigid.update(1/60,{x:0,z:0,r:1.15});
  assert.ok(rigid.nLive < rigid.nAct/5);
  const prop=level.props.find(p=>p.model.count>100);
  for(let i=0;i<180;i++){
    rigid.update(1/60,{x:prop.x,z:prop.z,r:1.15});
    fields.cube.flush(); fields.bead.flush();
  }
  assert.equal(level.props.reduce((n,p)=>n+p.remaining,0),rigid.propVoxels.size);
  for(const b of rigid.live){
    const t=b.body.translation();
    assert.ok(Number.isFinite(t.x+t.y+t.z));
  }
});
