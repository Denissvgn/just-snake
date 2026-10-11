import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createNeonView} from '../../assets/neon-view.js';
const options={THREE,grid:21,cell:1,bloomLayer:1};
const item=(active=false,type='common',x=14,z=10)=>({active,type,x,z,timer:4,maxTimer:8,deadlineMs:8000,isHopping:false,hopProgress:0,hopStartX:0,hopStartZ:0,hopTargetX:0,hopTargetZ:0});
const frame=()=>({segments:new Float32Array([10,10,10,10,9,10,9,10,8,10,8,10]),segmentCount:3,direction:{x:1,z:0},interpolation:1,wrap:false,foods:[item(true),item()],pillars:new Float32Array([5,5,15,5,5,15,15,15,10,10]),pillarCount:4,perimeterActive:true,perimeterPosition:3,screen:'playing',elapsed:1,options:{quality:'low',reducedMotion:false,highContrast:false,colorblind:'default'}});
function matrix(mesh,index=0){const m=new THREE.Matrix4();mesh.getMatrixAt(index,m);return m;}
function identities(view){const geo=new Set(),mats=new Set();view.scene.traverse(o=>{if(o.geometry)geo.add(o.geometry);if(o.material)mats.add(o.material);});return {geo,mats,children:view.scene.children.slice(),arrays:view.scene.children.filter(o=>o.instanceMatrix).map(o=>o.instanceMatrix.array)};}
function named(view,name){const o=view.scene.getObjectByName(name);assert.ok(o,name);return o;}
test('Neon camera maps all21square cells with distinct head/actual food/pillar pools',()=>{
 const view=createNeonView(options);try{view.resize(720,720);const f=frame(),before=JSON.stringify(f);view.sync(f);
  assert.equal(JSON.stringify(f),before);assert.equal(view.camera.type,'OrthographicCamera');assert.deepEqual(view.camera.position.toArray(),[0,24,0]);assert.deepEqual(view.camera.up.toArray(),[0,0,-1]);
  const right=new THREE.Vector3(10,0,0).project(view.camera),up=new THREE.Vector3(0,0,-10).project(view.camera);assert.ok(right.x>0&&up.y>0);
  for(const[x,z]of[[-10.5,-10.5],[10.5,-10.5],[10.5,10.5],[-10.5,10.5]]){const p=new THREE.Vector3(x,0,z).project(view.camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1);}
  assert.equal(named(view,'21 by 21 grid').geometry.attributes.position.count,88);
  assert.equal(named(view,'Amber segment outlines').count,3);assert.equal(named(view,'Two head eyes').count,2);assert.equal(named(view,'Head direction').count,1);
  assert.equal(named(view,'Actual food slots').count,1);assert.equal(named(view,'Actual pillar blocks').count,4);assert.equal(named(view,'Pillar crosses and wrap arrows').count,8);
  const food=matrix(named(view,'Actual food slots'));assert.equal(food.elements[12],4);assert.equal(food.elements[14],0);
 }finally{view.dispose();}
});
test('Shortest wrap interpolation uses edge copies and never creates a center-crossing connector',()=>{
 const view=createNeonView(options);try{const f=frame();f.wrap=true;f.segments=new Float32Array([0,10,20,10,20,10,19,10]);f.segmentCount=2;f.interpolation=.25;view.sync(f);
  const body=named(view,'Amber segment outlines');assert.equal(body.count,3);
  const xs=Array.from({length:body.count},(_,i)=>matrix(body,i).elements[12]);assert.ok(xs.some(x=>x===-10.75)&&xs.some(x=>x===10.25));assert.ok(xs.every(x=>Math.abs(x)>9));
  const links=named(view,'Short cell connectors');assert.ok(links.count>0);for(let i=0;i<links.count;i++)assert.ok(Math.abs(matrix(links,i).elements[12])>9);
  assert.equal(named(view,'Two head eyes').count,4);assert.equal(named(view,'Head direction').count,2);assert.equal(named(view,'Pillar crosses and wrap arrows').count,16);
 }finally{view.dispose();}
});
test('Actual food activation/archetype/timer/hop changes only owned marks and poses',()=>{
 const view=createNeonView(options);try{const f=frame();f.foods=[item(true,'golden'),item(true,'jittery',11,10)];f.foods[1].isHopping=true;Object.assign(f.foods[1],{hopProgress:.25,hopStartX:0,hopStartZ:0,hopTargetX:1,hopTargetZ:0});const before=JSON.stringify(f);view.sync(f);assert.equal(JSON.stringify(f),before);
  assert.equal(named(view,'Actual food slots').count,2);assert.equal(named(view,'Food type markings').count,10);assert.equal(matrix(named(view,'Actual food slots'),1).elements[12],.25);
  const width=Math.hypot(...matrix(named(view,'Food type markings'),5).elements.slice(0,3));assert.ok(Math.abs(width-.22)<1e-6);
  f.foods[0].active=false;f.foods[1].active=false;view.sync(f);assert.equal(named(view,'Actual food slots').count,0);assert.equal(named(view,'Food type markings').count,0);
 }finally{view.dispose();}
});
test('Borrowed mutable options use scalar cache; paused/low/reduced motion stay static',()=>{
 const view=createNeonView(options);try{const f=frame(),borrowed=f.options;borrowed.quality='high';view.setPresentationOptions(borrowed);view.sync(f);const playing=matrix(named(view,'Actual food slots')).elements.slice();f.screen='paused';f.elapsed=3;view.sync(f);assert.deepEqual(matrix(named(view,'Actual food slots')).elements,playing);
  borrowed.highContrast=true;borrowed.colorblind='colorblind';borrowed.reducedMotion=true;view.setPresentationOptions(borrowed);view.sync(f);
  assert.equal(named(view,'Wet city').visible,false);assert.equal(named(view,'Dark arena glass').material.opacity,.86);assert.equal(named(view,'Two head eyes').material.color.getHex(),0xffffff);
  const color=new THREE.Color();named(view,'Actual food slots').getColorAt(0,color);assert.equal(color.getHex(),0x5ea5ff);assert.ok(Math.abs(matrix(named(view,'Actual food slots')).elements[0]-.75)<1e-6);
  borrowed.highContrast=false;const readonly=JSON.stringify(f);view.setPresentationOptions(borrowed);view.sync(f);assert.equal(named(view,'Wet city').visible,true);assert.equal(JSON.stringify(f),readonly);
 }finally{view.dispose();}
});
test('Full441cell updates retain bounded geometries/materials/buffers and preallocated pools',()=>{
 const view=createNeonView(options);try{const before=identities(view),f=frame();f.segmentCount=441;f.segments=new Float32Array(441*4);for(let i=0;i<441;i++){const x=i%21,z=Math.floor(i/21);f.segments.set([x,z,x,z],i*4);}for(let i=0;i<100;i++)view.sync(f);const after=identities(view);
  assert.ok(before.geo.size<=12&&before.mats.size<=12);assert.deepEqual(after,before);assert.equal(named(view,'Amber segment outlines').count,441);assert.equal(named(view,'Amber segment outlines').instanceMatrix.count,882);assert.equal(named(view,'Short cell connectors').instanceMatrix.count,882);assert.ok(view.scene.children.length<=16);
 }finally{view.dispose();}
});
test('Optional local texture failures and disposed late callbacks never resurrect view resources',()=>{
 const jobs=[],created=[];let renders=0;class Loader{load(url,done,progress,error){const texture=new THREE.Texture();created.push(texture);jobs.push({url,done,error,texture});return texture;}}
 const view=createNeonView({...options,THREE:{...THREE,TextureLoader:Loader},assetURLs:{wide:'wide.jpg',portrait:'portrait.jpg'},requestRender:()=>renders++});
 const held=identities(view),instanceMeshes=held.children.filter(o=>o.isInstancedMesh),counts=new Map();for(const value of [...held.geo,...held.mats,...instanceMeshes,...created])value.addEventListener('dispose',()=>counts.set(value,(counts.get(value)||0)+1));
 jobs[0].error();assert.equal(named(view,'Wet city').material.map,null);assert.equal(renders,1);
 Object.assign(jobs[1].texture,{image:{width:720,height:1120}});jobs[1].done(jobs[1].texture);view.resize(300,300);assert.equal(named(view,'Wet city').material.map,jobs[1].texture);assert.equal(renders,2);
 view.dispose();view.dispose();for(const value of [...held.geo,...held.mats,...instanceMeshes,...created])assert.equal(counts.get(value),1);
 Object.assign(jobs[0].texture,{image:{width:1600,height:900}});jobs[0].done(jobs[0].texture);jobs[1].error();assert.equal(renders,2);assert.equal(view.scene.children.length,0);assert.equal(counts.get(jobs[0].texture),1);
});
test('Suspended/Low/reduced decorative beam and pulse freeze without suppressing essential interpolation',()=>{
 const view=createNeonView(options);try{
  const f=frame();f.options.quality='high';view.setPresentationOptions(f.options);view.sync(f);
  const beam=named(view,'Existing sweeping perimeter light'),position=beam.position.clone();
  const food=matrix(named(view,'Actual food slots')).elements.slice();
  f.suspended=true;f.perimeterPosition=40;f.elapsed=3;f.segments[0]=11;f.interpolation=.5;
  const borrowed=JSON.stringify(f);view.sync(f);
  assert.deepEqual(beam.position,position);assert.deepEqual(matrix(named(view,'Actual food slots')).elements,food);
  assert.equal(matrix(named(view,'Amber segment outlines')).elements[12],.5);assert.equal(JSON.stringify(f),borrowed);
  f.suspended=false;view.sync(f);assert.notDeepEqual(beam.position,position);
  const resumed=beam.position.clone();f.options.reducedMotion=true;view.setPresentationOptions(f.options);f.perimeterPosition=60;view.sync(f);assert.deepEqual(beam.position,resumed);
  f.options.reducedMotion=false;f.options.quality='low';view.setPresentationOptions(f.options);f.perimeterPosition=70;view.sync(f);assert.deepEqual(beam.position,resumed);
 }finally{view.dispose();}
});
test('Preferred failed plate uses matte even when the other local plate is loaded',()=>{
 const jobs=[];class Loader{load(url,done,progress,error){const texture=new THREE.Texture();jobs.push({url,done,error,texture});return texture;}}
 const view=createNeonView({...options,THREE:{...THREE,TextureLoader:Loader},assetURLs:{wide:'wide.jpg',portrait:'portrait.jpg'}});
 try{Object.assign(jobs[0].texture,{image:{width:1600,height:900}});jobs[0].done(jobs[0].texture);
  view.resize(720,720);assert.equal(named(view,'Wet city').material.map,jobs[0].texture);
  jobs[1].error();view.resize(300,300);assert.equal(named(view,'Wet city').material.map,null);
  view.resize(720,720);assert.equal(named(view,'Wet city').material.map,jobs[0].texture);
 }finally{view.dispose();}
});
test('Failed construction disposes every already-owned resource once before propagating error',()=>{
 const created=[],counts=new Map();const track=value=>{created.push(value);value.addEventListener('dispose',()=>counts.set(value,(counts.get(value)||0)+1));};
 const tracked=Base=>class extends Base{constructor(...args){super(...args);track(this);}};
 let calls=0;class FaultInstances extends THREE.InstancedMesh{constructor(...args){if(++calls===5)throw Error('Controlled instance construction failure');super(...args);track(this);}}
 assert.throws(()=>createNeonView({...options,THREE:{...THREE,BoxGeometry:tracked(THREE.BoxGeometry),PlaneGeometry:tracked(THREE.PlaneGeometry),BufferGeometry:tracked(THREE.BufferGeometry),MeshBasicMaterial:tracked(THREE.MeshBasicMaterial),LineBasicMaterial:tracked(THREE.LineBasicMaterial),InstancedMesh:FaultInstances}}),/Controlled instance construction failure/);
 assert.ok(created.length>10);for(const resource of created)assert.equal(counts.get(resource),1);
});
