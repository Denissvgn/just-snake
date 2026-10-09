import fs from 'node:fs';
import path from 'node:path';
import {test,expect} from '../helpers/release-fixture.mjs';
import {open,start,finishWithNativeResume,settings} from '../helpers/player-flow.mjs';
const completePositive=page=>finishWithNativeResume(page,{info:test.info()});
import {ROOT} from '../helpers/config.mjs';
import {localImports,sourceAdapter} from '../helpers/source-adapter.mjs';
const axeSource=fs.readFileSync(path.join(ROOT,'node_modules/axe-core/axe.min.js'),'utf8');
const key='threejs-snake-settings',query='?seed=a11y-regression&mode=classic&rules=2';
async function seed(page,extra={}) {
 await page.addInitScript(({key,extra})=>{
  if(!sessionStorage.getItem('__a11ySeeded')) {localStorage.setItem(key,JSON.stringify({schemaVersion:2,values:{quality:'low',aa:'none',haptics:false,sound:false,...extra}}));sessionStorage.setItem('__a11ySeeded','1');}
  window.__settingsWrites=[];const put=Storage.prototype.setItem;
  Storage.prototype.setItem=function(name,value){if(name===key)window.__settingsWrites.push(value);return put.call(this,name,value);};
 },{key,extra});
}
const pressed=(page,id,value)=>expect(page.locator(`#${id}`)).toHaveAttribute('aria-pressed',String(value));
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
async function menu(page,options){await open(page,query);await settings(page,options);}

test('ACC-A11Y-01 absent motion/contrast inherit live OS changes without persistence',async({gamePage:page})=>{
 await seed(page);await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});await menu(page);
 await pressed(page,'motionToggleBtn',true);await pressed(page,'contrastToggleBtn',true);
 await page.emulateMedia({reducedMotion:'no-preference',contrast:'no-preference'});
 await pressed(page,'motionToggleBtn',false);await pressed(page,'contrastToggleBtn',false);
 await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});
 await pressed(page,'motionToggleBtn',true);await pressed(page,'contrastToggleBtn',true);
 expect(await page.evaluate(()=>window.__settingsWrites)).toEqual([]);
 expect((await saved(page)).values).not.toHaveProperty('reducedMotion');expect((await saved(page)).values).not.toHaveProperty('highContrast');
});
test('ACC-A11Y-01 explicit false overrides live OS and in-game reduced choice controls CSS independently',async({gamePage:page})=>{
 await seed(page,{reducedMotion:false,highContrast:false});await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});await menu(page);
 await pressed(page,'motionToggleBtn',false);await pressed(page,'contrastToggleBtn',false);
 await page.evaluate(()=>document.getElementById('score').classList.add('pop'));
 expect(await page.locator('#score').evaluate(el=>getComputedStyle(el).animationName)).toBe('scorePop');
 await page.emulateMedia({reducedMotion:'no-preference',contrast:'no-preference'});await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});
 await pressed(page,'motionToggleBtn',false);expect(await page.evaluate(()=>window.__settingsWrites)).toEqual([]);
 await page.locator('#motionToggleBtn').click();await pressed(page,'motionToggleBtn',true);
 expect(await page.locator('#score').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await expect(page.locator('#a11yStatus')).toContainText('The snake still moves');
 expect(await page.locator('#a11yStatus').evaluate(el=>!el.closest('[inert]')&&!el.closest('.hidden')&&getComputedStyle(el).visibility==='visible')).toBe(true);
});

test('ACC-A11Y-02 ordinary reduced-motion option preserves active gameplay and disables HUD animations',async({gamePage:page})=>{
 await seed(page);await page.emulateMedia({reducedMotion:'no-preference'});await open(page,query);await start(page);await settings(page);
 await page.locator('#motionToggleBtn').click();
 await page.evaluate(()=>{for(const id of ['score','best','levelBadge'])document.getElementById(id).classList.add(id==='levelBadge'?'level-up':id==='score'?'pop':'new-record');});
 for(const id of ['score','best','levelBadge'])expect(await page.locator('#'+id).evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.locator('#closeSettingsBtnAction').click();await page.locator('#actionBtn').click();await completePositive(page);
 await expect(page.locator('.summary-cause')).toContainText('wall');expect((await saved(page)).values.reducedMotion).toBe(true);
});

test('ACC-A11Y-03 menu keyboard/focus/status and axe have no critical or serious violations',async({gamePage:page})=>{
 await seed(page);await open(page,query);await page.addScriptTag({content:axeSource});
 async function audit(stage){const violations=await page.evaluate(async()=>{const result=await window.axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return result.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));});expect(violations,stage).toEqual([]);}
 await audit('title');await settings(page);await audit('settings');
 await page.locator('#closeSettingsBtn').focus();
 const focusSnapshot=()=>page.locator('#settingsModal').evaluate(modal=>{
  const nodes=[...modal.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex]')].filter(el=>{
   if(el.matches(':disabled')||el.tabIndex<0||el.closest('[hidden],[inert]'))return false;
   const style=getComputedStyle(el);if(style.visibility!=='visible'||style.display==='none'||![...el.getClientRects()].some(r=>r.width>0&&r.height>0))return false;
   for(let details=el.parentElement?.closest('details');details;details=details.parentElement?.closest('details'))if(!details.open&&el!==details.querySelector(':scope > summary'))return false;
   return true;
  });return {count:nodes.length,index:nodes.indexOf(document.activeElement),tags:nodes.map(el=>el.tagName)};
 });
 const initial=await focusSnapshot();expect(initial.tags).toContain('SUMMARY');expect(initial.index).toBeGreaterThanOrEqual(0);
 for(const [direction,delta] of [['Tab',1],['Shift+Tab',-1]]){
  for(let i=1;i<=initial.count;i++){
   await page.keyboard.press(direction);const current=await focusSnapshot();expect(current.count).toBe(initial.count);
   expect(current.index).toBe((initial.index+delta*i+initial.count)%initial.count);
   expect(await page.evaluate(()=>document.getElementById('settingsModal').contains(document.activeElement))).toBe(true);
   expect(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle)).toBe('solid');
  }
  await expect(page.locator('#closeSettingsBtn')).toBeFocused();
 }
 const pressedStates=await page.locator('#tierPills button,#aaPills button,#bodyPills button,#palettePills button,#keymapPills button,#settingsModeSelector button,#bloomToggleBtn,#bloomModeBtn,#soundToggleBtn,#hapticsToggleBtn,#motionToggleBtn,#contrastToggleBtn').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-pressed')));
 expect(pressedStates.every(value=>value==='true'||value==='false')).toBe(true);
 await page.keyboard.press('Escape');await start(page);await page.keyboard.press('Space');await audit('pause');
 await page.locator('#actionBtn').click();await completePositive(page);await audit('summary');await page.locator('#leaderboardBtn').click();await audit('rankings');
 await page.evaluate(()=>{const error=document.getElementById('bootError');error.textContent='The game could not start. Reload to try again.';error.style.display='block';});await audit('error');
});

test('ACC-A11Y-04 palette/contrast remain selected across tiers and reload with visible focus',async({gamePage:page})=>{
 await seed(page);await page.emulateMedia({contrast:'no-preference'});await menu(page,{advanced:true});
 await page.locator('#palettePills [data-palette="colorblind"]').click();await page.locator('#contrastToggleBtn').click();
 for(const tier of ['high','balanced','low']){
  await page.locator(`#tierPills [data-tier="${tier}"]`).click();await pressed(page,'contrastToggleBtn',true);
  await expect(page.locator('#palettePills [data-palette="colorblind"]')).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Tab');expect(await page.evaluate(()=>parseFloat(getComputedStyle(document.activeElement).outlineWidth))).toBeGreaterThanOrEqual(3);
 }
 const before=await saved(page);await page.reload();await settings(page);
 await pressed(page,'contrastToggleBtn',true);await expect(page.locator('#palettePills [data-palette="colorblind"]')).toHaveAttribute('aria-pressed','true');expect(await saved(page)).toEqual(before);
});

if(!process.env.RELEASE_DIST) test.describe('actual renderer arrangements',()=>{
 test.use({sourceHooks:true});
 async function arrange(page){await page.route('**/snake-three.html*',async route=>{
  const response=await route.fetch();const hooks=`window.__a11yRenderer={
    sample(){return {pos:camera.position.toArray(),quat:camera.quaternion.toArray(),view:camera.matrixWorldInverse.toArray(),projection:camera.projectionMatrix.toArray(),fov:camera.fov,roll:camera.rotation.z,ca:compMat?.uniforms.ca.value??null,grain:compMat?.uniforms.grain.value??null,post:POST.enabled,frames:renderedFrames,base:camBase.toArray()};},
    effects(){shake=.9;triggerSpeedKick();CAMERA_LIFE.testSnakeLength=60;stepMs=MIN_STEP_MS;triggerCameraDeath({x:5,y:0,z:5},{x:1,z:0});score=120;HUD_FX.update(score,best);},
    eat(){food.x=segs[0].x+dir.x;food.z=segs[0].z+dir.z;step();},
    death(){gameOver('wall');},
    palette(){return Object.fromEntries(['common','golden','jittery'].map(t=>[t,{color:PREY_FX.mats[t].color.getHexString(),geometry:PREY_FX.geos[t].type,vertices:PREY_FX.geos[t].attributes.position.count}]));}
  };`;
  await route.fulfill({response,body:sourceAdapter(localImports(await response.text(),new URL(route.request().url()).origin+'/'),{hooks})});
 });}
 for(const tier of ['high','low'])test(`ACC-A11Y-02 actual rendered ${tier} camera matrices/uniforms stay fitted across eat speed death and live toggles`,async({gamePage:page})=>{
  await seed(page,{quality:tier,aa:'none'});await page.emulateMedia({reducedMotion:'no-preference'});await arrange(page);await open(page,query);await start(page);await settings(page);
  await page.locator('#motionToggleBtn').click();await page.locator('#closeSettingsBtnAction').click();
  const base=await page.evaluate(()=>window.__a11yRenderer.sample());
  await page.evaluate(()=>{window.__a11yRenderer.eat();window.__a11yRenderer.effects();});
  const target=base.frames+4;await page.waitForFunction(n=>window.__snakeRenderedFrames>n,target);
  const after=await page.evaluate(()=>window.__a11yRenderer.sample());
  for(const field of ['pos','quat','view','projection','fov','roll'])expect(after[field],field).toEqual(base[field]);
  expect(after.fov).toBe(52);expect(after.roll).toBe(0);if(after.post){expect(after.ca).toBe(0);expect(after.grain).toBe(0);}
  await settings(page);await page.locator('#motionToggleBtn').click();await page.locator('#closeSettingsBtnAction').click();
  await page.evaluate(()=>{window.__a11yRenderer.effects();window.__a11yRenderer.death();});await page.waitForFunction(n=>window.__snakeRenderedFrames>n,after.frames+3);
  const full=await page.evaluate(()=>window.__a11yRenderer.sample());expect(full.pos).not.toEqual(base.pos);
  await settings(page);await page.locator('#motionToggleBtn').click();await page.locator('#closeSettingsBtnAction').click();
  await page.waitForFunction(n=>window.__snakeRenderedFrames>n,full.frames+3);
  const stable=await page.evaluate(()=>window.__a11yRenderer.sample());for(const field of ['pos','quat','view','projection'])expect(stable[field]).toEqual(base[field]);
 });
 test('ACC-A11Y-01 inherited live OS motion changes actual camera pose without saving overrides',async({gamePage:page})=>{
  await seed(page,{quality:'high',aa:'none'});await page.emulateMedia({reducedMotion:'no-preference'});await arrange(page);await open(page,query);await start(page);await settings(page);await page.locator('#closeSettingsBtnAction').click();
  await page.evaluate(()=>window.__a11yRenderer.effects());const initial=await page.evaluate(()=>window.__a11yRenderer.sample());
  await page.waitForFunction(n=>window.__snakeRenderedFrames>n,initial.frames+3);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('body')).toHaveClass(/reduced-motion/);
  const reduced=await page.evaluate(()=>window.__a11yRenderer.sample());expect(reduced.pos).toEqual(reduced.base);expect(reduced.fov).toBe(52);
  await page.evaluate(()=>window.__a11yRenderer.effects());await page.waitForFunction(n=>window.__snakeRenderedFrames>n,reduced.frames+3);
  const after=await page.evaluate(()=>window.__a11yRenderer.sample());for(const field of ['pos','quat','view','projection'])expect(after[field]).toEqual(reduced[field]);
  expect(after.ca).toBe(0);expect(after.grain).toBe(0);expect((await saved(page)).values).not.toHaveProperty('reducedMotion');expect(await page.evaluate(()=>window.__settingsWrites)).toEqual([]);
 });
 test('ACC-A11Y-04 actual prey palettes and distinct silhouettes survive every graphics tier',async({gamePage:page})=>{
  await seed(page);await arrange(page);await menu(page,{advanced:true});await page.locator('#palettePills [data-palette="colorblind"]').click();
  for(const tier of ['high','balanced','low']){
   await page.locator(`#tierPills [data-tier="${tier}"]`).click();const palette=await page.evaluate(()=>window.__a11yRenderer.palette());
   expect(Object.values(palette).map(p=>p.geometry)).toEqual(['IcosahedronGeometry','OctahedronGeometry','CapsuleGeometry']);
   expect(Object.values(palette).map(p=>p.color)).toEqual(['06b6d4','fbbf24','ec4899']);
  }
 });
});
