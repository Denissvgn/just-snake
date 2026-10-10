import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {browserLaunchProfile,linuxFirefoxEnvironment} from '../tests/helpers/browser-profile.mjs';
import {ROOT,node24,BROWSER_PATH} from '../tests/helpers/config.mjs';
import {parseEngines,checkedInputs,payloadMap,exact} from './release-contract.mjs';
import {createServer} from './serve.mjs';
import {installReleaseRoutes} from '../tests/helpers/request-policy.mjs';
import {rendererReady} from '../tests/helpers/source-adapter.mjs';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= BROWSER_PATH;
const [playwright,{default:config},{finishWithNativeResume}]=await Promise.all([
  import('playwright'),import('../playwright.config.mjs'),import('../tests/helpers/player-flow.mjs')
]);
export function parseCapabilityOptions(args){
  const options={candidate:null,engines:undefined,output:null};const seen=new Set();
  for(let i=0;i<args.length;i+=2){const key=args[i]?.slice(2),value=args[i+1];
    if(!args[i]?.startsWith('--')||!Object.hasOwn(options,key)||!value||seen.has(key))throw Error('Unknown/missing/duplicate capability option');
    seen.add(key);options[key]=value;
  }
  if(!options.candidate||!options.output)throw Error('--candidate and --output are required');
  options.engines=parseEngines(options.engines);options.candidate=path.resolve(options.candidate);options.output=path.resolve(options.output);return options;
}
export async function boundedOperation(label,action,timeoutMs){
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>180000)throw Error('Invalid capability deadline');
  let timer;
  try{return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' deadline exceeded')),timeoutMs);})]);}
  finally{clearTimeout(timer);}
}
export function remainingCleanupBudget(deadline,now=Date.now()){
  return Math.max(1,Math.min(6000,deadline-now));
}
export function calibrationRecord(sample){
  const ticks=sample.timestamps||[];
  return {...sample,diagnosticOnly:true,method:'Seven native browser rAF ticks / six intervals on the same-origin no-game 404 document',
    intervalsMs:ticks.slice(1).map((time,index)=>time-ticks[index]),
    complete:ticks.length===7&&ticks.every((time,index)=>Number.isFinite(time)&&(index===0||time>=ticks[index-1]))&&sample.bootAbsent===true&&sample.frameGetterAbsent===true};
}
export async function acquireOwnedHTTP(create,{timeoutMs,register=()=>{}}){
  let expired=false;
  try{return await boundedOperation('Capability HTTP server',()=>Promise.resolve().then(create).then(async owner=>{
    register(owner);
    if(expired){await boundedOperation('Late owned HTTP close',()=>owner.close(),1000);throw Error('Late HTTP listener after deadline');}
    return owner;
  }),timeoutMs);}
  catch(error){expired=true;throw error;}
}
export async function forceOwnedBrowser(server,{timeoutMs=3000}={}){
  if(!server)return;
  const child=server.process();
  try{await boundedOperation('Owned browser kill',()=>server.kill(),timeoutMs);}
  catch(error){
    // Only the process returned by our own launchServer is eligible. Never use
    // browser names/global PID searches; group kill requires PGID == owned PID.
    if(child?.pid){try{const group=Number(execFileSync('ps',['-o','pgid=','-p',String(child.pid)],{encoding:'utf8',timeout:1000}).trim());process.kill(group===child.pid?-child.pid:child.pid,'SIGKILL');}catch{try{child.kill('SIGKILL');}catch{}}}
    throw error;
  }
}
export async function finalizeCapabilityReport(report,{originalError,killBrowser,closeHTTP,persist}){
  let failure=originalError;
  for(const [label,action] of [['Owned browser cleanup',killBrowser],['Capability HTTP close',closeHTTP]]){
    if(!action)continue;
    try{await boundedOperation(label,action,label==='Owned browser cleanup'?4000:1000);}
    catch(error){report.passed=false;(report.cleanupErrors||=[]).push(error.message);failure??=error;report.error??=failure.message;}
  }
  report.finishedAt=new Date().toISOString();
  try{await boundedOperation('Capability report write',()=>persist(report),1000);}
  catch(error){report.passed=false;report.persistenceError=error.message;failure??=error;}
  if(report.passed!==true)failure??=Error(report.error||'Failed/incomplete capability preflight');
  if(failure)throw failure;
  return report;
}
export function validateCapability(row){
  const integer=(value,min,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
  if(row.gl?.supported!==true||row.gl.lost!==false||row.gl.error!==0||row.gl.shaderCompiled!==true||row.gl.programLinked!==true)throw Error('Real WebGL2 draw unavailable');
  const pixel=row.gl.pixel;
  if(!Array.isArray(pixel)||pixel.length!==4||pixel.some(v=>!Number.isInteger(v)||v<0||v>255)||Math.abs(pixel[0]-51)>1||Math.abs(pixel[1]-102)>1||Math.abs(pixel[2]-153)>1||pixel[3]<254)throw Error('Real WebGL2 readback mismatch');
  if(row.boot?.booted!==true||!integer(row.boot.frames,1)||row.boot.lost!==false||row.boot.failure!==null)throw Error('Candidate renderer did not complete a healthy draw');
  const g=row.gamePixels;
  if(!g||g.framebufferBound!==false||g.error!==0||!integer(g.w,1,128)||!integer(g.h,1,128)||!integer(g.nonzeroPixels,64,g.w*g.h)||!integer(g.distinctColors,5,g.w*g.h)||!integer(g.frames,row.boot.frames)||!integer(g.attempts,1,3))throw Error('Actual game main buffer is blank or unreadable');
  const r=row.record;
  if(!r||r.schemaVersion!==2||r.rulesVersion!==2||r.seed!=='browser-capability-preflight-v2'||r.mode!=='classic'||r.category!=='custom'||!integer(r.timeMs,1)||!['wall','pillar','self','target','board'].includes(r.outcome)||row.recordCount!==1)throw Error('Candidate native simulation did not complete an eligible movement run');
  if(row.final?.booted!==true||!integer(row.final.frames,row.boot.frames+1)||row.final.lost!==false||row.final.failure!==null||row.final.hidden!==false||row.final.focused!==true)throw Error('Candidate renderer became unusable');
  if(!integer(row.completion?.resumeCount,0,3)||row.completion.maxResumes!==3||row.completion.timeoutMs!==15000||!integer(row.completion.elapsedMs,0,15000)||!Array.isArray(row.nativeActions)||row.nativeActions.length!==1+row.completion.resumeCount||row.nativeActions.some(action=>action.trusted!==true||action.screen!=='playing'))throw Error('Candidate movement was not activated by native actions');
  const errorKeys=['pageErrors','consoleErrors','unexpectedRequests'];
  if(!row.errors||Object.keys(row.errors).length!==errorKeys.length||errorKeys.some(key=>!Array.isArray(row.errors[key])||row.errors[key].length))throw Error('Capability browser errors or non-origin requests');
  return true;
}
export function validateCapabilityReport(report,{engines,inputs,payload,platform}){
  if(report.diagnosticOnly===true)throw Error('Diagnostic-only control cannot qualify a release matrix');
  if(report.schemaVersion!==1||report.kind!=='candidate-capability-preflight'||report.passed!==true||report.architecture!=='arm64')throw Error('Failed/incomplete capability report');
  if(!['linux','darwin'].includes(report.platform)||(engines.includes('webkit')&&report.platform!=='darwin'))throw Error('Required native browser platform missing');
  if(platform!==undefined&&report.platform!==platform)throw Error('Capability/report platform drift');
  exact(report.engines,engines,'Capability selected engines');exact(report.inputs,inputs,'Capability input identity');exact(report.payload,payload,'Capability payload identity');
  if(!Array.isArray(report.checks)||report.checks.length!==engines.length||new Set(report.checks.map(row=>row.engine)).size!==engines.length)throw Error('Missing/duplicate capability engine');
  for(const row of report.checks){if(!engines.includes(row.engine)||row.passed!==true||!/arm64|aarch64/i.test(row.executableArchitecture||''))throw Error('Invalid capability engine');validateCapability(row);const profile=browserLaunchProfile(row.engine,report.platform);exact({headless:row.launch?.headless,firefoxUserPrefs:row.launch?.firefoxUserPrefs},profile,'Actual functional/preflight launch profile');if(row.engine==='firefox'&&report.platform==='linux'){linuxFirefoxEnvironment({DISPLAY:row.launch.display,...row.launch.softwareEnvironment});if(!/llvmpipe/i.test(row.gl.renderer))throw Error('Actual Linux Firefox Mesa software renderer missing');}exact(row.gl.viewport,[config.use.viewport.width,config.use.viewport.height],'Normal capability viewport');if(row.gl.dpr!==1)throw Error('Normal capability DPR');}
  return true;
}
async function candidateIdentity(directory){
  const manifest=JSON.parse(await fs.readFile(path.join(directory,'candidate.json')));
  if(manifest.schemaVersion!==1||manifest.product!=='just-snake')throw Error('Candidate schema');
  exact(await checkedInputs(),manifest.inputs,'Capability checked inputs');exact(await payloadMap(path.join(directory,'dist')),manifest.payload,'Capability payload');return manifest;
}
export async function runCapabilityPreflight(options){
  node24();await fs.mkdir(options.output,{recursive:false});
  const report={schemaVersion:1,kind:'candidate-capability-preflight',passed:false,platform:process.platform,architecture:process.arch,node:process.version,engines:options.engines,checks:[],startedAt:new Date().toISOString()};
  const overallEnd=Date.now()+180000;
  let expired=false;
  let app,server,originalError;
  const watchdog=setTimeout(()=>{expired=true;report.error='Overall preflight deadline exceeded';report.passed=false;forceOwnedBrowser(server).catch(error=>{report.cleanupError=error.message;});},174000);
  const remaining=()=>Math.max(1,Math.min(30000,overallEnd-Date.now()-6000));
  try{
    const candidate=await boundedOperation('Candidate identity',()=>candidateIdentity(options.candidate),remaining());report.inputs=candidate.inputs;report.payload=candidate.payload;
    app=await acquireOwnedHTTP(()=>createServer({root:path.join(options.candidate,'dist'),source:false,prefix:'/just-snake/'}),{timeoutMs:remaining(),register:owner=>{app=owner;}});
    for(const engine of options.engines){
      if(expired||Date.now()>=overallEnd-6000)throw Error('Overall preflight deadline exceeded');
      const engineEnd=Math.min(overallEnd,Date.now()+60000);
      const operation=(label,action)=>{
        const ms=Math.min(30000,engineEnd-Date.now()-6000,overallEnd-Date.now()-6000);
        if(expired||ms<=0)throw Error(engine+' preflight deadline exceeded');
        return boundedOperation(engine+' '+label,action,ms);
      };
      const row={engine,passed:false,errors:{pageErrors:[],consoleErrors:[],unexpectedRequests:[]}};report.checks.push(row);
      const project=config.projects.find(p=>p.name===engine);let browser,context,page,tracing=false,launchExpired=false;
      try{
        if(engine==='webkit'&&process.platform!=='darwin')throw Error('WebKit evidence requires native macOS');
        const profile=browserLaunchProfile(engine);const usedProfile={headless:project.use.headless??profile.headless,firefoxUserPrefs:project.use.launchOptions?.firefoxUserPrefs??profile.firefoxUserPrefs};exact(usedProfile,profile,'Functional/preflight project launch profile');row.launch={...usedProfile,display:null,softwareEnvironment:null};if(engine==='firefox'&&process.platform==='linux')Object.assign(row.launch,linuxFirefoxEnvironment());
        try{
          server=await operation('launch',()=>playwright[engine].launchServer({...project.use.launchOptions,headless:usedProfile.headless,firefoxUserPrefs:usedProfile.firefoxUserPrefs,timeout:30000}).then(async owner=>{
            if(launchExpired){await forceOwnedBrowser(owner);throw Error('Late browser launch after deadline');}
            server=owner;return owner;
          }));
        }catch(error){launchExpired=true;throw error;}
        const spawned=server.process().spawnfile;
        row.executable=engine==='webkit'?path.join(path.dirname(spawned),'Playwright.app/Contents/MacOS/Playwright'):spawned;
        row.executableArchitecture=execFileSync('file',['-b',row.executable],{encoding:'utf8',timeout:10000}).trim();
        if(!/arm64|aarch64|ARM aarch64/i.test(row.executableArchitecture))throw Error('Browser executable is not native ARM64');
        browser=await operation('connect',()=>playwright[engine].connect(server.wsEndpoint(),{timeout:30000}));row.version=browser.version();
        context=await operation('context',()=>browser.newContext({viewport:config.use.viewport,baseURL:app.baseURL}));
        await operation('trace start',()=>context.tracing.start({screenshots:false,snapshots:true,sources:true}));
        tracing=true;
        await operation('preferences',()=>context.addInitScript(()=>{
          localStorage.setItem('threejs-snake-settings',JSON.stringify({schemaVersion:2,values:{quality:'low',aa:'none',bloomOn:false,sound:false,haptics:false}}));
          window.__capabilityNativeActions=[];
          window.addEventListener('click',event=>{if(event.target.closest?.('#actionBtn'))window.__capabilityNativeActions.push({trusted:event.isTrusted,screen:document.body.dataset.screen,at:performance.now()});});
        }));
        page=await operation('page',()=>context.newPage());page.on('pageerror',e=>row.errors.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')row.errors.consoleErrors.push(m.text());});
        await operation('routes',()=>installReleaseRoutes(page,{baseURL:app.baseURL,source:false,errors:row.errors}));
        try{
          await operation('empty-document navigation',()=>page.goto('404.html',{timeout:30000}));
          const sample=await operation('empty-document rAF calibration',()=>page.evaluate(()=>new Promise(resolve=>{
            const timestamps=[];window.__calibrationActive=true;
            const tick=time=>{if(!window.__calibrationActive)return;timestamps.push(time);
              if(timestamps.length===7){window.__calibrationActive=false;resolve({timestamps,url:location.href,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,hidden:document.hidden,visibility:document.visibilityState,focused:document.hasFocus(),bootAbsent:typeof window.__snakeBooted==='undefined',frameGetterAbsent:!Object.hasOwn(window,'__snakeRenderedFrames')});}
              else window.__calibrationRAF=requestAnimationFrame(tick);
            };window.__calibrationRAF=requestAnimationFrame(tick);
          })));
          row.calibration=calibrationRecord({...sample,platform:process.platform,executable:row.executable});
        }catch(error){row.calibration={diagnosticOnly:true,complete:false,error:error.message};}
        finally{await operation('calibration observer stop',()=>page.evaluate(()=>{window.__calibrationActive=false;cancelAnimationFrame(window.__calibrationRAF);}));}
        await operation('navigation',()=>page.goto('index.html?seed=browser-capability-preflight-v2&mode=classic&rules=2',{timeout:30000}));
        await operation('boot',()=>page.waitForFunction(()=>window.__snakeFailure||(window.__snakeBooted===true&&window.__snakeRenderedFrames>0),undefined,{timeout:30000}));
        const bootFailure=await operation('boot diagnosis',()=>page.evaluate(()=>window.__snakeFailure));
        if(bootFailure)throw Error('Candidate boot failure: '+JSON.stringify(bootFailure));
        await operation('renderer readiness',()=>rendererReady(page));
        await operation('passive failure telemetry',()=>page.evaluate(()=>{
          const frames=new Array(600),events=[],monitor={frames,events,index:0,previous:null,active:true};
          window.__capabilityFailureTelemetry=monitor;
          const sample=timestamp=>{
            if(!monitor.active)return;
            frames[monitor.index++%600]={timestamp,intervalMs:monitor.previous===null?null:timestamp-monitor.previous,screen:document.body.dataset.screen,renderedFrames:window.__snakeRenderedFrames};
            monitor.previous=timestamp;monitor.raf=requestAnimationFrame(sample);
          };
          monitor.raf=requestAnimationFrame(sample);
          for(const name of ['blur','focus','visibilitychange','pagehide','pageshow']){
            const target=name==='visibilitychange'?document:window;
            target.addEventListener(name,event=>{if(events.length<100)events.push({name,trusted:event.isTrusted,at:performance.now(),hidden:document.hidden,visibility:document.visibilityState,focused:document.hasFocus(),screen:document.body.dataset.screen});});
          }
        }));
        row.boot=await operation('completed draw',()=>page.evaluate(()=>({booted:window.__snakeBooted===true,frames:window.__snakeRenderedFrames,failure:window.__snakeFailure,lost:document.querySelector('canvas').getContext('webgl2').isContextLost()})));
        row.gamePixels=await operation('game readback',()=>page.evaluate(()=>new Promise(resolve=>{
          let attempts=0;
          const sample=()=>{
            const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2'),w=Math.min(128,canvas.width),h=Math.min(128,canvas.height),bytes=new Uint8Array(w*h*4);
            const framebufferBound=gl.getParameter(gl.FRAMEBUFFER_BINDING)!==null;
            if(!framebufferBound)gl.readPixels(Math.floor((canvas.width-w)/2),Math.floor((canvas.height-h)/2),w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
            let nonzeroPixels=0;const colors=new Set();for(let i=0;i<bytes.length;i+=4){if(bytes[i]+bytes[i+1]+bytes[i+2]>0)nonzeroPixels++;colors.add(bytes[i]+','+bytes[i+1]+','+bytes[i+2]);}
            const result={w,h,framebufferBound,nonzeroPixels,distinctColors:colors.size,error:gl.getError(),frames:window.__snakeRenderedFrames,attempts:++attempts};
            if((nonzeroPixels>=64&&colors.size>=5)||attempts===3)resolve(result);else requestAnimationFrame(sample);
          };requestAnimationFrame(sample);
        })));
        row.gl=await operation('WebGL2 draw/readback',()=>page.evaluate(()=>{
          const canvas=document.createElement('canvas');canvas.width=4;canvas.height=4;const gl=canvas.getContext('webgl2',{antialias:false});
          if(!gl)return{supported:false};
          const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);return s;};
          const vs=compile(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));gl_Position=vec4(p[gl_VertexID],0.,1.);}');
          const fs=compile(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;out vec4 color;void main(){color=vec4(.2,.4,.6,1.);}');
          const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
          const shaderCompiled=gl.getShaderParameter(vs,gl.COMPILE_STATUS)&&gl.getShaderParameter(fs,gl.COMPILE_STATUS),programLinked=gl.getProgramParameter(program,gl.LINK_STATUS);
          gl.useProgram(program);gl.viewport(0,0,4,4);gl.drawArrays(gl.TRIANGLES,0,3);gl.finish();const pixel=new Uint8Array(4);gl.readPixels(1,1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
          const ext=gl.getExtension('WEBGL_debug_renderer_info');const result={supported:true,shaderCompiled,programLinked,pixel:[...pixel],error:gl.getError(),lost:gl.isContextLost(),version:gl.getParameter(gl.VERSION),renderer:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER),vendor:gl.getParameter(ext?ext.UNMASKED_VENDOR_WEBGL:gl.VENDOR),extensions:gl.getSupportedExtensions(),dpr:devicePixelRatio,viewport:[innerWidth,innerHeight]};
          gl.deleteProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);return result;
        }));
        if(!row.gl.supported)throw Error('Real WebGL2 context unavailable');
        if(engine==='firefox'&&process.platform==='linux'&&!/llvmpipe/i.test(row.gl.renderer))throw Error('Diagnostic Mesa software renderer was not identified by actual WebGL');
        await operation('native Start',()=>page.locator('#actionBtn').click({timeout:15000}));
        row.completion=await operation('native movement',()=>finishWithNativeResume(page));
        const completed=await operation('completion observation',()=>page.evaluate(()=>({records:JSON.parse(localStorage.getItem('threejs-snake-scores-v2')).records,booted:window.__snakeBooted===true,frames:window.__snakeRenderedFrames,failure:window.__snakeFailure,lost:document.querySelector('canvas').getContext('webgl2').isContextLost(),hidden:document.hidden,focused:document.hasFocus()})));
        row.recordCount=completed.records.length;row.record=completed.records[0];row.final=completed;
        row.nativeActions=await operation('native actions',()=>page.evaluate(()=>window.__capabilityNativeActions));
        row.loadedTelemetry=await operation('diagnostic loaded telemetry',()=>page.evaluate(()=>{
          const monitor=window.__capabilityFailureTelemetry;
          return {method:'Passive native browser rAF intervals; not exact SIMULATION.rawMs',frames:monitor?.frames.filter(Boolean).sort((a,b)=>a.timestamp-b.timestamp)||[],events:monitor?.events||[],nativeActions:window.__capabilityNativeActions||[]};
        }));
        validateCapability(row);row.passed=true;
      }catch(error){
        row.error=error.message;if(error.completion)row.completion=error.completion;
        const diagnosisMs=Math.min(3000,engineEnd-Date.now()-6000,overallEnd-Date.now()-6000);
        if(page&&!page.isClosed()&&diagnosisMs>0)try{
          row.failedObservation=await boundedOperation('Bounded failure observation',()=>page.evaluate(()=>{
            const canvas=document.querySelector('canvas'),gl=canvas?.getContext('webgl2');
            const monitor=window.__capabilityFailureTelemetry;
            return {nativeActions:window.__capabilityNativeActions||[],now:performance.now(),screen:document.body.dataset.screen,title:document.getElementById('title')?.textContent,telemetry:document.getElementById('pauseTelemetry')?.textContent,frames:window.__snakeRenderedFrames,booted:window.__snakeBooted,failure:window.__snakeFailure,lost:gl?gl.isContextLost():null,hidden:document.hidden,visibility:document.visibilityState,focused:document.hasFocus(),viewport:[innerWidth,innerHeight],failureTelemetry:monitor?{method:'Passive native-browser rAF callback intervals; not exact private SIMULATION.rawMs',frames:monitor.frames.filter(Boolean).sort((a,b)=>a.timestamp-b.timestamp),events:monitor.events}:null};
          }),diagnosisMs);
        }catch(diagnosticError){row.observationError=diagnosticError.message;}
        throw error;
      }
      finally{
        const failures=[];
        const cleanupEnd=Math.min(engineEnd,overallEnd,Date.now()+6000);
        const close=async(label,action)=>{try{await boundedOperation(label,action,remainingCleanupBudget(cleanupEnd));}catch(error){failures.push(label+': '+error.message);}};
        if(page&&!page.isClosed())await close('screenshot',()=>page.screenshot({path:path.join(options.output,engine+'.png')}));
        if(tracing)await close('trace',()=>context.tracing.stop({path:path.join(options.output,engine+'-trace.zip')}));
        if(context)await close('context',()=>context.close());
        if(browser)await close('browser',()=>browser.close());
        if(server){const owner=server;await close('server',()=>owner.close());if(failures.length)await close('owned kill',()=>forceOwnedBrowser(owner,{timeoutMs:remainingCleanupBudget(cleanupEnd)}));server=null;}
        if(failures.length){row.cleanupErrors=failures;row.passed=false;if(!row.error){row.error=failures.join('; ');throw Error(row.error);}}
      }
      console.log('PASS real candidate capability '+engine);
    }
    await boundedOperation('Final candidate identity',()=>candidateIdentity(options.candidate),remaining());if(expired)throw Error('Overall preflight deadline exceeded');
    report.passed=true;return report;
  }catch(error){originalError=error;report.error??=error.message;throw error;}
  finally{
    clearTimeout(watchdog);
    await finalizeCapabilityReport(report,{originalError,
      killBrowser:server?()=>forceOwnedBrowser(server):null,
      closeHTTP:app?()=>app.close():null,
      persist:value=>fs.writeFile(path.join(options.output,'capabilities.json'),JSON.stringify(value,null,2)+'\n')});
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runCapabilityPreflight(parseCapabilityOptions(process.argv.slice(2))).catch(error=>{console.error(error.message);process.exitCode=1;});
