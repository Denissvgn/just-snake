import {test,expect} from '../helpers/release-fixture.mjs';
import {open,start,finishWithNativeResume,settings} from '../helpers/player-flow.mjs';
import {localImports,sourceAdapter} from '../helpers/source-adapter.mjs';
const finish=page=>finishWithNativeResume(page,{info:test.info()});
const key='threejs-snake-scores-v2';
const modes=['classic','calm','frenzy'];
const timing={classic:[115,62,4],calm:[140,95,3],frenzy:[90,45,4]};
function record({id='record',mode='classic',seed='scope',category='custom',score=20,length=score/10+3,timeMs=200,completedAt='2026-10-08T12:00:00.000Z',...extra}={}){
 const [base,min,step]=timing[mode];const total=length-3;
 return {schemaVersion:2,rulesVersion:2,runId:id,mode,seed,isDaily:category==='daily',dailyDate:category==='daily'?seed.slice(6):null,category,score,length,timeMs,maxSpeedLevel:1+Math.ceil((base-Math.max(min,base-Math.floor(score/30)*step))/step),maxCombo:1,foodBreakdown:{common:total,golden:0,jittery:0,total},outcome:'wall',completedAt,...extra};
}
const envelope=records=>({schemaVersion:2,records,legacy:{best:null,records:[]},legacyImported:true});
async function install(page,fixtures){await page.addInitScript(({fixtures,key})=>{
 const name=new URL(location.href).searchParams.get('fixture')||'default';const f=fixtures[name]||fixtures.default;
 if(sessionStorage.getItem('score-fixture')!==name){localStorage.clear();sessionStorage.setItem('score-fixture',name);localStorage.setItem('threejs-snake-settings',JSON.stringify({schemaVersion:2,values:{quality:'low',aa:'none',sound:false,haptics:false}}));
  if(f.v2!==undefined)localStorage.setItem(key,typeof f.v2==='string'?f.v2:JSON.stringify(f.v2));
  if(f.oldBest!==undefined)localStorage.setItem('threejs-snake-best',f.oldBest);if(f.oldRows!==undefined)localStorage.setItem('threejs-snake-leaderboard',JSON.stringify(f.oldRows));
 }
 const get=Storage.prototype.getItem,put=Storage.prototype.setItem;window.__scoreWrites=0;window.__oldWrites=0;window.__peek=k=>get.call(localStorage,k);window.__copies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__copies.push(text)}});
 Storage.prototype.getItem=function(k){if(f.denyReads?.includes(k))throw new DOMException('Denied','SecurityError');return get.call(this,k);};
 Storage.prototype.setItem=function(k,v){if(k===key){window.__scoreWrites++;if(f.denyWrites)throw new DOMException('Denied','QuotaExceededError');}if(['threejs-snake-best','threejs-snake-leaderboard'].includes(k))window.__oldWrites++;return put.call(this,k,v);};
 },{fixtures,key});}
async function activeGap(page,readClock=false){return page.evaluate(readClock=>{
 const visible=el=>Boolean(el&&!el.hidden&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility==='visible'&&el.getClientRects().length);
 const gl=document.querySelector('canvas')?.getContext('webgl2');
 const before={screen:document.body.dataset.screen,hidden:document.hidden,visibility:document.visibilityState,focused:document.hasFocus(),failure:window.__snakeFailure,lost:gl?.isContextLost(),modal:visible(document.getElementById('settingsModal')),error:visible(document.getElementById('bootError'))};
 if(before.screen!=='playing'||before.hidden||before.visibility!=='visible'||!before.focused||before.failure!==null||before.lost!==false||before.modal||before.error)throw Error('Forced gap requires actual healthy focused active play: '+JSON.stringify(before));
 const clock=readClock?window.simulationTime():null;
 const end=performance.now()+300;while(performance.now()<end){};
 return {before,clock};
 },readClock);}
const stored=page=>page.evaluate(key=>JSON.parse(window.__peek(key)),key);
function scope(r){return JSON.stringify([2,r.mode,r.category,r.category==='casual'?null:r.seed]);}

 test('ACC-STORE-01 real owned record metadata scoped modes reload and share identity',async({gamePage:page})=>{
 test.setTimeout(60000);
 const records=[];for(const mode of modes)for(const category of['casual','custom','daily'])records.push(record({id:mode+'-'+category,mode,category,seed:category==='daily'?'DAILY-2026-10-08':category==='casual'?'CASUAL-fixture':'scope-'+mode}));
 records.push(record({id:'pack-prior',seed:'pack-smoke-15738'}));
 await install(page,{default:{v2:envelope(records)}});
 for(const mode of modes)for(const category of['casual','custom','daily']){const seed=category==='daily'?'DAILY-2026-10-08':category==='casual'?null:'scope-'+mode;await open(page,`?mode=${mode}${seed?'&seed='+seed:''}&rules=2`);await start(page);await page.keyboard.press('Space');await expect(page.locator('#best')).toHaveText('Best: 20');}
 await open(page,'?seed=pack-smoke-15738&mode=classic&rules=2');await start(page);await finish(page);await page.locator('#shareBtn').click();expect((await page.evaluate(()=>window.__copies))[0]).toContain('pack-smoke-15738');
 const data=await stored(page);const saved=data.records.find(r=>r.seed==='pack-smoke-15738'&&r.runId!=='pack-prior');expect(saved).toMatchObject({schemaVersion:2,rulesVersion:2,mode:'classic',seed:'pack-smoke-15738',category:'custom',isDaily:false,dailyDate:null,score:10,length:4,maxSpeedLevel:1,maxCombo:1,foodBreakdown:{common:1,golden:0,jittery:0,total:1},outcome:'wall'});expect(saved.timeMs).toBe(1265);expect(saved.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);expect(saved.runId).toBeTruthy();
 await page.locator('#leaderboardBtn').click();await expect(page.locator('.lb-title')).toContainText('On this device');await expect(page.locator('.lb-row')).toHaveCount(2);expect(await page.evaluate(()=>window.__oldWrites)).toBe(0);
 await page.reload();expect((await stored(page)).records.filter(r=>r.runId===saved.runId)).toHaveLength(1);await start(page);await page.keyboard.press('Space');await expect(page.locator('#best')).toHaveText('Best: 20');
 });

 test('ACC-STORE-02 migration poison oversized records denied reads and session-only writes',async({gamePage:page})=>{
 test.setTimeout(60000);
 const old={score:41,length:4,timeSec:1,maxCombo:1,maxSpeedLevel:1,mode:'classic',date:'2026-10-08T12:00:00.000Z'};
 const good=record({seed:'pack-smoke-15738'});const poison=[...['mode','category','runId','seed','isDaily','dailyDate','completedAt','rulesVersion','score','length','timeMs','maxSpeedLevel','maxCombo','foodBreakdown','outcome'].map(k=>({...good,runId:'bad-'+k,[k]:k==='mode'?['classic']:k==='dailyDate'?'2026-02-30':null})),{...good,runId:'oversized',junk:'x'.repeat(9000)},{...good,runId:'impossible-speed',maxSpeedLevel:4},{...good,runId:'impossible-food',foodBreakdown:{common:0,golden:0,jittery:0,total:2}},{...good,runId:'practice',category:'practice'}];
 const inaccessible=JSON.stringify(envelope([good]));
 await install(page,{default:{oldBest:'41',oldRows:[old,{...old,mode:['classic']}]},poison:{v2:envelope([good,...poison])},oversized:{v2:envelope(Array.from({length:1001},(_,i)=>({...good,runId:'excess'+i})))},denied:{oldBest:'41',oldRows:[old],denyWrites:true},readLegacy:{oldBest:'41',oldRows:[old],denyReads:['threejs-snake-best','threejs-snake-leaderboard']},readV2:{v2:inaccessible,denyReads:[key]}});
 await open(page,'?seed=pack-smoke-15738&mode=classic');let data=await stored(page);expect(data.legacyImported).toBe(true);expect(data.legacy).toEqual({best:41,records:[old]});await page.reload();expect((await stored(page)).legacy.records).toHaveLength(1);expect(await page.evaluate(()=>[window.__peek('threejs-snake-best'),window.__peek('threejs-snake-leaderboard')])).toEqual(['41',JSON.stringify([old,{...old,mode:['classic']}])]);
 await start(page);await finish(page);await page.locator('#leaderboardBtn').click();await expect(page.locator('.earlier-title')).toHaveText('Legacy scores — earlier rules');
 for(const name of['poison','oversized']){await open(page,`?seed=pack-smoke-15738&mode=classic&fixture=${name}`);await start(page);await finish(page);expect((await stored(page)).records).toHaveLength(name==='poison'?2:1);}
 await open(page,'?seed=pack-smoke-15738&mode=classic&fixture=readLegacy');expect((await stored(page)).legacyImported).toBe(false);expect(await page.evaluate(()=>window.__oldWrites)).toBe(0);
 await open(page,'?seed=pack-smoke-15738&mode=classic&fixture=readV2');await expect(page.locator('#scoreStorageStatus')).toHaveText('Scores are saved for this session only.');expect(await page.evaluate(key=>window.__peek(key),key)).toBe(inaccessible);expect(await page.evaluate(()=>window.__scoreWrites)).toBe(0);
 await open(page,'?seed=pack-smoke-15738&mode=classic&fixture=denied');await expect(page.locator('#scoreStorageStatus')).toHaveText('Scores are saved for this session only.');
 for(let i=0;i<2;i++){await start(page);await finish(page);await page.locator('#leaderboardBtn').click();await expect(page.locator('.lb-row')).toHaveCount(i+2);await page.locator('#leaderboardBtn').click();}
 expect(await stored(page)).toBeNull();expect(await page.evaluate(()=>window.__oldWrites)).toBe(0);await page.reload();await start(page);await finish(page);await page.locator('#leaderboardBtn').click();await expect(page.locator('.earlier-title')).toHaveCount(1);
 });

 test('ACC-STORE-03 top10 ties global scope retention UTF8 cap and reload',async({gamePage:page})=>{
 test.setTimeout(60000);const rows=[];
 for(const mode of modes)rows.push(record({id:'casual-'+mode,mode,category:'casual',seed:'CASUAL-old',completedAt:'2000-01-01T00:00:00.000Z'}));
 for(let m=0;m<3;m++)for(let n=0;n<11;n++)rows.push(record({id:`custom-${m}-${n}`,mode:modes[m],seed:`custom-${m}-${n}`,completedAt:new Date(Date.UTC(2026,6,1,m*11+n)).toISOString()}));
 for(let n=1;n<=31;n++)rows.push(record({id:'daily-'+n,mode:modes[n%3],category:'daily',seed:`DAILY-2026-08-${String(n).padStart(2,'0')}`,completedAt:`2026-08-${String(n).padStart(2,'0')}T12:00:00.000Z`}));
 const tied=['ä','z','a','Z','😀'].map(id=>record({id,seed:'ties',score:10}));
 const top=Array.from({length:12},(_,i)=>record({id:'top-'+i,seed:'top',score:(i+1)*10,completedAt:`2026-09-${String(i+1).padStart(2,'0')}T00:00:00.000Z`}));
 // Separate ranking fixture avoids adding two custom scopes to the global-retention fixture.
 const large=[];for(const mode of modes)for(let n=0;n<10;n++)large.push(record({id:`casual-${mode}-${n}`,mode,category:'casual',seed:'🐍'.repeat(128),score:10*(n+1)}));
 for(let i=0;i<30;i++)for(let n=0;n<10;n++){large.push(record({id:`u-${i}-${n}`,mode:modes[i%3],seed:'🐍'.repeat(125)+String(i).padStart(3,'0'),score:10*(n+1),completedAt:new Date(Date.UTC(2026,0,1,i)).toISOString()}));large.push(record({id:`d-${i}-${n}`,mode:modes[i%3],category:'daily',seed:`DAILY-2026-09-${String(i+1).padStart(2,'0')}`,score:10*(n+1),completedAt:new Date(Date.UTC(2026,3,1,i)).toISOString()}));}
 await install(page,{default:{v2:envelope(rows)},ranks:{v2:envelope([...tied,...top])},utf8:{v2:envelope(large)}});
 await open(page,'?mode=classic');await start(page);await finish(page);let data=await stored(page);let scopes=[...new Set(data.records.map(scope))];expect(scopes.filter(k=>JSON.parse(k)[2]==='casual')).toHaveLength(3);expect(scopes.filter(k=>JSON.parse(k)[2]==='custom')).toHaveLength(30);expect(scopes.filter(k=>JSON.parse(k)[2]==='daily')).toHaveLength(30);expect(data.records.some(r=>r.runId==='daily-1')).toBe(false);for(let n=0;n<3;n++)expect(data.records.some(r=>r.runId==='custom-0-'+n)).toBe(false);await page.reload();expect((await stored(page)).records).toEqual(data.records);
 await open(page,'?mode=classic&fixture=ranks');await start(page);await finish(page);data=await stored(page);expect(data.records.filter(r=>r.seed==='ties').map(r=>r.runId)).toEqual(['Z','a','z','ä','😀']);expect(data.records.filter(r=>r.seed==='top').map(r=>r.score)).toEqual([120,110,100,90,80,70,60,50,40,30]);
 await open(page,'?mode=classic&fixture=utf8');await start(page);await finish(page);data=await stored(page);expect(new TextEncoder().encode(JSON.stringify(data)).length).toBeLessThanOrEqual(256*1024);expect(data.records.filter(r=>r.category==='casual')).toHaveLength(30);const kept=[...new Set(data.records.filter(r=>r.category==='custom').map(r=>Number(r.seed.slice(-3))))].sort((a,b)=>a-b);expect(kept.length).toBeLessThan(30);expect(kept).toEqual(Array.from({length:kept.length},(_,i)=>30-kept.length+i));expect(new Set(data.records.filter(r=>r.category==='daily').map(scope)).size).toBe(30);await page.reload();expect((await stored(page)).records).toEqual(data.records);
 });

if(!process.env.RELEASE_DIST)test.describe('owned finalization invariants',()=>{
 test.use({sourceHooks:true});
 test('ACC-STORE-01 real300ms source readonly clock freezes exactly until native completion',async({gamePage:page},info)=>{
  await install(page,{default:{v2:envelope([])}});await page.route('**/snake-three.html*',async route=>{const response=await route.fetch();await route.fulfill({response,body:sourceAdapter(localImports(await response.text(),new URL('.',route.request().url()).href))});});
  await open(page,'?seed=pack-smoke-15738&mode=classic&rules=2');await start(page);const writes=await page.evaluate(()=>window.__scoreWrites);
  const forced=await activeGap(page,true);await expect(page.locator('body')).toHaveAttribute('data-screen','paused');
  expect(await page.evaluate(()=>window.simulationTime())).toBe(forced.clock);await page.waitForTimeout(300);expect(await page.evaluate(()=>window.simulationTime())).toBe(forced.clock);expect(await page.evaluate(()=>window.__scoreWrites)).toBe(writes);
  const result=await finishWithNativeResume(page,{info});expect(result.resumeCount).toBeGreaterThanOrEqual(1);expect(result.resumeCount).toBeLessThanOrEqual(3);
  const rows=(await stored(page)).records;expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({seed:'pack-smoke-15738',mode:'classic',score:10,length:4,timeMs:1265,outcome:'wall'});expect(await page.evaluate(()=>window.__scoreWrites)).toBe(writes+1);expect(await page.evaluate(()=>window.__oldWrites)).toBe(0);
  await info.attach('readonly-simulation-clock-gap',{body:JSON.stringify({method:'Actual300ms active main-thread stall; readonly source simulationTime, no clock/interval overrides',before:forced.clock,paused:forced.clock,recordTimeMs:rows[0].timeMs,resumes:result.resumeCount}),contentType:'application/json'});
 });
 test('ACC-STORE-02 repeated failed legacy migration keeps one session archive and false success flag',async({gamePage:page})=>{
 const old={score:41,length:4,timeSec:1,maxCombo:1,maxSpeedLevel:1,mode:'classic',date:'2026-10-08T12:00:00.000Z'};await install(page,{default:{oldBest:'41',oldRows:[old],denyWrites:true}});await page.route('**/snake-three.html*',async route=>{const response=await route.fetch();await route.fulfill({response,body:sourceAdapter(localImports(await response.text(),new URL(route.request().url()).origin+'/'),{hooks:`window.__migration=()=>{const a=SCORE_STORE.load();const b=SCORE_STORE.load();const c=SCORE_STORE.load();return {same:a===b&&b===c,flag:a.legacyImported,rows:a.legacy.records.length};};`})});});await open(page,'?mode=classic');expect(await page.evaluate(()=>window.__migration())).toEqual({same:true,flag:false,rows:1});expect(await page.evaluate(()=>window.__scoreWrites)).toBe(1);
 });
 test('ACC-STORE-01 duplicate finalize practice and demo never insert a second player record',async({gamePage:page})=>{
 await install(page,{default:{v2:envelope([])}});await page.route('**/snake-three.html*',async route=>{const response=await route.fetch();const hooks=`window.__storeOwned=()=>{startGame();pauseGame();const first=RUN_STATS.finalize('wall');const second=RUN_STATS.finalize('self');const rows=SCORE_STORE.load().records.length;RUN_STATS.saveToLeaderboard(first);const repeat=SCORE_STORE.load().records.length;startGame();pauseGame();RUN_STATS.run=Object.freeze({...RUN_STATS.run,category:'practice'});score=10;segs.push(makeBodyCell(0,0));RUN_STATS.foodBreakdown={common:1,golden:0,jittery:0,total:1};const practice=RUN_STATS.finalize('wall');const afterPractice=SCORE_STORE.load().records.length;startAttract(true);RUN_STATS.finalize('wall');RUN_STATS.renderLeaderboardView();return {same:first===second,rows,repeat,afterPractice,afterDemo:SCORE_STORE.load().records.length,practiceRecord:practice.isNewBest,legacyImported:SCORE_STORE.load().legacyImported};};`;await route.fulfill({response,body:sourceAdapter(localImports(await response.text(),new URL(route.request().url()).origin+'/'),{hooks})});});
 await open(page,'?seed=owned&mode=classic');expect(await page.evaluate(()=>window.__storeOwned())).toEqual({same:true,rows:1,repeat:1,afterPractice:1,afterDemo:1,practiceRecord:false,legacyImported:true});
 });
});

 test('ACC-STORE-01 real300ms gap stays paused until guarded native completion then stores exact1265ms record',async({gamePage:page},info)=>{
  await install(page,{default:{v2:envelope([])}});await open(page,'?seed=pack-smoke-15738&mode=classic&rules=2');await start(page);
  const writes=await page.evaluate(()=>window.__scoreWrites);
  const forced=await activeGap(page);expect(forced.before.screen).toBe('playing');
  await expect(page.locator('body')).toHaveAttribute('data-screen','paused');await expect(page.locator('#actionBtn')).toHaveText('Resume');
  const before=await page.locator('#pauseTelemetry').textContent();await page.waitForTimeout(300);await expect(page.locator('#pauseTelemetry')).toHaveText(before);expect(await page.evaluate(()=>window.__scoreWrites)).toBe(writes);
  const result=await finishWithNativeResume(page,{info});expect(result.resumeCount).toBeGreaterThanOrEqual(1);expect(result.resumeCount).toBeLessThanOrEqual(3);
  const rows=(await stored(page)).records;expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({seed:'pack-smoke-15738',mode:'classic',category:'custom',score:10,length:4,timeMs:1265,outcome:'wall'});expect(await page.evaluate(()=>window.__scoreWrites)).toBe(writes+1);expect(await page.evaluate(()=>window.__oldWrites)).toBe(0);
 });
