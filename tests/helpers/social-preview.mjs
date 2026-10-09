import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from '../../scripts/serve.mjs';
import {sourceAdapter} from './source-adapter.mjs';
import {node24,ROOT,BROWSER_PATH} from './config.mjs';
import {allowedRequest} from './request-policy.mjs';

const hooks=`window.__social={async prepare(){renderer.setAnimationLoop(null);stopAttract(true,false);setMode('classic');challengeSelection.seedIntent='custom';RNG.setSeed('just-snake-social-v2');startGame();pauseGame();SETTINGS.tuned=2;SETTINGS.safetyReason=null;SETTINGS.set('quality','high');SETTINGS.set('aa','none');SETTINGS.set('reducedMotion',true);SETTINGS.set('bodyMode','tube');SETTINGS.set('bloomOn',true);SETTINGS.set('bloomMask',true);for(const s of segs)removeSegment(s);const cells=[];for(let z=7;z<12;z++)for(let i=0;i<11;i++)cells.push([z%2?15-i:5+i,z]);segs=cells.slice(0,38).map(([x,z],i)=>i?makeBodyCell(x,z):makeHeadCell(x,z));dir={x:1,z:0};inputQueue=[];elapsed=0;motionFactor=0;eatFlash=0;shake=0;lengthDirty=true;applyLengthStyle();applyPreyType('golden',0);food.x=16;food.z=12;foodMesh.position.set(cellToWorldX(food.x),.75,cellToWorldZ(food.z));foodMesh.visible=true;foodMesh2.visible=false;drawSnake(1,0);drawFood(0);drawCamera(0);scene.updateMatrixWorld(true);const frame=()=>{drawSnake(1,0);drawFood(0);drawCamera(0);renderFrame();};for(let i=0;i<12;i++)frame();let count=0;const present=()=>{frame();count++;if(window.__socialPresent)requestAnimationFrame(present);};window.__socialPresent=true;requestAnimationFrame(present);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {seed:'just-snake-social-v2',mode:'classic',tier:quality.tier,aa:POST.aa,body:'tube',elapsed,canvas:[renderer.domElement.width,renderer.domElement.height],camera:camera.matrixWorld.elements.slice(),fog:[scene.fog.near,scene.fog.far],food:[food.x,food.z],length:segs.length};}};window.__socialReady=true;`;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function generateSocialPreview({output=path.join(ROOT,'assets/social-preview.png'),reportRoot=path.join(ROOT,'.artifacts/social-preview')}={}) {
  node24();process.env.PLAYWRIGHT_BROWSERS_PATH ||= BROWSER_PATH;
  const {chromium}=await import('playwright');
  await fs.mkdir(reportRoot,{recursive:true});const directory=await fs.mkdtemp(path.join(reportRoot,'capture-'));
  let app,browser;const errors=[];
  const report={schemaVersion:1,product:'just-snake',sourceHash:sha(await fs.readFile(path.join(ROOT,'snake-three.html'))),helperHash:sha(await fs.readFile(fileURLToPath(import.meta.url))),lockHash:sha(await fs.readFile(path.join(ROOT,'package-lock.json'))),testsLockHash:sha(await fs.readFile(path.join(ROOT,'tests/package-lock.json'))),node:process.version,platform:process.platform,architecture:process.arch,method:'Fixed local tuple, paused pose, High tube, AA none, steady camera/time; warm render-only presented frames; local system typography. Native Chromium SwiftShader, not physical-device/FPS certification.',errors};
  const watchdog=setTimeout(()=>{errors.push('180s capture watchdog');browser?.close();},180000);
  try {
    app=await createServer();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});report.engineVersion=browser.version();
    const context=await browser.newContext({viewport:{width:820,height:630},deviceScaleFactor:1});const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>localStorage.setItem('threejs-snake-settings',JSON.stringify({schemaVersion:2,values:{quality:'low',aa:'none',sound:false,haptics:false,reducedMotion:true}})));
    await page.route('**/*',async route=>{if(!allowedRequest(route.request().url(),app.baseURL)){errors.push('Non-origin request '+route.request().url());return route.abort();}if(route.request().resourceType()!=='document')return route.continue();const response=await route.fetch();await route.fulfill({response,body:sourceAdapter(await response.text(),{hooks})});});
    await page.goto(app.baseURL+'?seed=just-snake-social-v2&mode=classic&rules=2');await page.waitForFunction(()=>window.__socialReady&&window.__snakeBooted&&window.__snakeRenderedFrames>0);
    report.pose=await page.evaluate(()=>window.__social.prepare());
    await page.addStyleTag({content:'body > :not(canvas) { visibility:hidden !important; }'});
    const capture=await page.locator('canvas').screenshot({animations:'disabled'});await page.evaluate(()=>window.__socialPresent=false);await context.close();
    const design=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
    await design.setContent(`<html lang="en"><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;background:#05070d;color:#e2e8f0;font-family:system-ui,-apple-system,Segoe UI,sans-serif}.game{position:absolute;right:0;top:0;width:820px;height:630px}.shade{position:absolute;inset:0;background:linear-gradient(90deg,#05070d 0%,#05070d 29%,rgba(5,7,13,.92) 35%,transparent 62%)}main{position:absolute;left:56px;top:146px;width:460px}h1{font-size:72px;letter-spacing:-3px;line-height:1.05;margin:0 0 26px;color:#bef264}p{font-size:29px;line-height:1.4;margin:0 0 34px}.modes{font-size:18px;letter-spacing:2px;color:#67e8f9}.foot{position:absolute;left:56px;bottom:50px;font-size:18px;color:#94a3b8}</style></head><body><img class="game" alt="Glowing snake and golden prey" src="data:image/png;base64,${capture.toString('base64')}"><div class="shade"></div><main><h1>just-snake</h1><p>Eat prey. Grow to 60.<br>Keep your tail in sight.</p><div class="modes">CLASSIC · CALM · FRENZY</div></main><div class="foot">Daily challenges · Scores on your device</div></body></html>`);
    await design.locator('img').evaluate(img=>img.decode());await design.evaluate(()=>document.fonts.ready);
    await fs.mkdir(path.dirname(output),{recursive:true});const png=await design.screenshot({path:output});
    report.output=path.relative(ROOT,output);report.bytes=png.length;report.sha256=sha(png);report.dimensions=[png.readUInt32BE(16),png.readUInt32BE(20)];if(report.dimensions.join('x')!=='1200x630'||png.length>1024*1024)throw Error('Invalid social image dimensions/budget');if(errors.length)throw Error('Capture diagnostics failed');report.passed=true;
  }catch(error){report.passed=false;report.failure=error.stack||String(error);throw error;}
  finally{clearTimeout(watchdog);await browser?.close();await app?.close();await fs.writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');}
  return {directory,...report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--output'))throw Error('Usage: node tests/helpers/social-preview.mjs [--output <png>]');
  console.log(JSON.stringify(await generateSocialPreview(args.length?{output:path.resolve(args[1])}:{}),null,2));
}
