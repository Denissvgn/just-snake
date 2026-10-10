import { expect } from '@playwright/test';
export const entry = process.env.RELEASE_DIST ? 'index.html' : 'snake-three.html';
export async function open(page, query = '') { await page.goto(`${entry}${query}`); }
export async function start(page) { await page.locator('#actionBtn').click(); }
export async function finish(page) { await expect(page.locator('#title')).toHaveText(/Game Over|You Win!/, { timeout: 15000 }); }
export async function settings(page, { advanced = false } = {}) {
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  if (!advanced) return;
  const disclosure = page.getByRole('button', { name: /^Advanced graphics/ });
  if (await disclosure.count()) { if (await disclosure.getAttribute('aria-expanded') === 'false') await disclosure.click(); return; }
  const summary = page.locator('summary').filter({ hasText: 'Advanced graphics' });
  if (await summary.count()) { if (!await summary.evaluate(element => element.parentElement.open)) await summary.click(); }
}

export function validateCompletionObservation(value,{paused=false}={}) {
  if(value.hidden||value.visibility!=='visible'||!value.focused||value.modalVisible||value.bootErrorVisible||value.failure!==null||value.lost!==false||!value.booted)throw Error('Completion requires a healthy visible focused game without modal or recovery failure');
  if(paused&&(value.screen!=='paused'||value.title!=='Paused'||value.action.text!=='Resume'||!value.action.visible||!value.action.enabled))throw Error('Completion requires the exact visible enabled Paused/Resume action');
  return true;
}
export function createNativeResumeBudget({maxResumes=3,timeoutMs=15000}={}) {
 if(!Number.isSafeInteger(maxResumes)||maxResumes<0||maxResumes>3||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)throw Error('Native progress bounds must be maxResumes0..3 and timeoutMs1..15000');
 const startedAt=Date.now();return {startedAt,runStartedAt:startedAt,record:{resumeCount:0,observations:[],maxResumes,timeoutMs}};
}
export function beginNativeCompletionPhase(budget) {
 validateNativeResumeBudget(budget,3,10000);if(budget.completionPhase||budget.record.progressReady!==true||Date.now()-budget.startedAt>=10000)throw Error('Completion phase requires one unexpired10s progress budget');
 budget.completionPhase=true;budget.record.progressElapsedMs=Date.now()-budget.startedAt;budget.startedAt=Date.now();budget.record.timeoutMs=15000;return budget;
}
function validateNativeResumeBudget(budget,maxResumes,timeoutMs) {
 if(!Number.isSafeInteger(maxResumes)||maxResumes<0||maxResumes>3||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)throw Error('Invalid native progress bounds');
 if(!budget||!Number.isSafeInteger(budget.startedAt)||!Number.isSafeInteger(budget.runStartedAt)||budget.runStartedAt>budget.startedAt||budget.startedAt>Date.now()||!budget.record||budget.record.maxResumes!==maxResumes||budget.record.timeoutMs!==timeoutMs||!Number.isSafeInteger(budget.record.resumeCount)||budget.record.resumeCount<0||budget.record.resumeCount>maxResumes||!Array.isArray(budget.record.observations))throw Error('Invalid shared native progress budget');
}
export function validateScoreProgressObservation(value,{score=10,comparison='exact'}={}) {
 if(!Number.isSafeInteger(score)||score<1||!['exact','minimum'].includes(comparison))throw Error('Invalid score progress goal');
 validateCompletionObservation(value);
 if(!['playing','paused'].includes(value.screen))throw Error('Score progress rejects premature summary/title/unknown states');
 const match=/^Score: (0|[1-9]\d*)$/.exec(value.scoreText||'');const actualScore=match?Number(match[1]):NaN;
 if(!Number.isSafeInteger(actualScore)||actualScore<0||comparison==='exact'&&actualScore>score)throw Error('Exact Score10 progress was malformed or missed');
 if(value.screen==='paused'){validateCompletionObservation(value,{paused:true});return 'paused';}
 return (comparison==='minimum'?actualScore>=score:actualScore===score)?'ready':'waiting';
}
export async function waitForScoreWithNativeResume(page,{score=10,comparison='exact',maxResumes=3,timeoutMs=15000,info,budget=createNativeResumeBudget({maxResumes,timeoutMs})}={}) {
 validateNativeResumeBudget(budget,maxResumes,timeoutMs);if(!Number.isSafeInteger(score)||score<1||!['exact','minimum'].includes(comparison))throw Error('Invalid score progress goal');let primaryError,capturedObservation;const record=budget.record;const remaining=()=>Math.max(0,timeoutMs-(Date.now()-budget.startedAt));
 try{
  while(remaining()>0){
   const before=capturedObservation??await page.evaluate(()=>{
    const visible=el=>Boolean(el&&!el.hidden&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility==='visible'&&[...el.getClientRects()].some(r=>r.width>0&&r.height>0));
    const canvas=document.querySelector('canvas'),gl=canvas&&(canvas.getContext('webgl2')||canvas.getContext('webgl')),button=document.getElementById('actionBtn');
    return {screen:document.body.dataset.screen,title:document.getElementById('title')?.textContent.trim(),scoreText:document.getElementById('score')?.textContent,overlayVisible:visible(document.getElementById('overlay')),hidden:document.hidden,visibility:document.visibilityState,focused:document.hasFocus(),modalVisible:visible(document.getElementById('settingsModal')),bootErrorVisible:visible(document.getElementById('bootError')),failure:window.__snakeFailure??null,lost:gl?gl.isContextLost():null,booted:window.__snakeBooted===true,action:{text:button?.textContent.trim(),visible:visible(button),enabled:Boolean(button&&!button.matches(':disabled')&&button.getAttribute('aria-disabled')!=='true')},pauseTelemetry:document.getElementById('pauseTelemetry')?.textContent};
   });
   capturedObservation=undefined;record.observations.push(Object.freeze({...before,phase:'score-progress'}));if(remaining()<=0)throw Error('Score progress deadline exceeded');const status=validateScoreProgressObservation(before,{score,comparison});
   if(status==='ready'){record.progressReady=true;return record;}
   if(status==='paused'){
    if(record.resumeCount>=maxResumes)throw Error('Score progress native Resume attempt bound exceeded');
    await page.locator('#actionBtn').click({timeout:Math.max(1,remaining())});record.resumeCount++;continue;
   }
   const handle=await page.waitForFunction(({score,comparison})=>{
    const visible=el=>Boolean(el&&!el.hidden&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility==='visible'&&[...el.getClientRects()].some(r=>r.width>0&&r.height>0));
    const scoreText=document.getElementById('score')?.textContent,screen=document.body.dataset.screen,hidden=document.hidden,focused=document.hasFocus();
    const canvas=document.querySelector('canvas'),gl=canvas&&(canvas.getContext('webgl2')||canvas.getContext('webgl'));
    const match=/^Score: (0|[1-9]\d*)$/.exec(scoreText||''),actual=match?Number(match[1]):NaN;
    const modalVisible=visible(document.getElementById('settingsModal')),bootErrorVisible=visible(document.getElementById('bootError')),failure=window.__snakeFailure??null,lost=gl?gl.isContextLost():null;
    if(Number.isSafeInteger(actual)&&actual<score&&screen==='playing'&&!hidden&&focused&&!modalVisible&&!bootErrorVisible&&!failure&&lost===false)return false;
    const button=document.getElementById('actionBtn');
    return {capturedAt:performance.now(),screen,title:document.getElementById('title')?.textContent.trim(),scoreText,overlayVisible:visible(document.getElementById('overlay')),hidden,visibility:document.visibilityState,focused,modalVisible,bootErrorVisible,failure,lost,booted:window.__snakeBooted===true,action:{text:button?.textContent.trim(),visible:visible(button),enabled:Boolean(button&&!button.matches(':disabled')&&button.getAttribute('aria-disabled')!=='true')},pauseTelemetry:document.getElementById('pauseTelemetry')?.textContent};
   },{score,comparison},{timeout:Math.max(1,remaining())});
   let snapshot;try{snapshot=await handle.jsonValue();}catch(error){try{await handle.dispose();}catch{}throw error;}
   await handle.dispose();capturedObservation=Object.freeze({...snapshot,action:Object.freeze({...snapshot.action}),failure:snapshot.failure?Object.freeze({...snapshot.failure}):null});
  }
  throw Error('Score progress deadline exceeded');
 }catch(error){primaryError=error;error.progress=record;throw error;}
 finally{record.elapsedMs=Date.now()-budget.startedAt;record.totalElapsedMs=Date.now()-budget.runStartedAt;if(info)try{await info.attach('bounded-native-score-progress',{body:JSON.stringify(record),contentType:'application/json'});}catch(error){if(!primaryError)throw error;}}
}
export async function finishWithNativeResume(page,{maxResumes=3,timeoutMs=15000,info,budget}={}) {
  if(!Number.isSafeInteger(maxResumes)||maxResumes<0||maxResumes>3||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)throw Error('Completion bounds must be maxResumes0..3 and timeoutMs1..15000');
  if(budget)validateNativeResumeBudget(budget,maxResumes,timeoutMs);
  const started=budget?.startedAt??Date.now(),record=budget?.record??{resumeCount:0,observations:[],maxResumes,timeoutMs};
  let primaryError;const remaining=()=>Math.max(0,timeoutMs-(Date.now()-started));
  const observe=()=>page.evaluate(()=>{
    const visible=el=>Boolean(el&&!el.hidden&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility==='visible'&&[...el.getClientRects()].some(r=>r.width>0&&r.height>0));
    const canvas=document.querySelector('canvas'),gl=canvas&&(canvas.getContext('webgl2')||canvas.getContext('webgl')),button=document.getElementById('actionBtn');
    return {screen:document.body.dataset.screen,title:document.getElementById('title')?.textContent.trim(),hidden:document.hidden,visibility:document.visibilityState,focused:document.hasFocus(),modalVisible:visible(document.getElementById('settingsModal')),bootErrorVisible:visible(document.getElementById('bootError')),failure:window.__snakeFailure??null,lost:gl?gl.isContextLost():null,booted:window.__snakeBooted===true,summaryVisible:visible(document.querySelector('.summary-grid')),action:{text:button?.textContent.trim(),visible:visible(button),enabled:Boolean(button&&!button.matches(':disabled')&&button.getAttribute('aria-disabled')!=='true')},pauseTelemetry:document.getElementById('pauseTelemetry')?.textContent};
  });
  try {
    while(remaining()>0){
      const before=await observe();record.observations.push(budget?{...before,phase:'completion'}:before);if(budget&&remaining()<=0)throw Error('Shared native progress/completion deadline exceeded');validateCompletionObservation(before);
      if(before.screen==='summary'){
        if(before.summaryVisible&& /^(Game Over|You Win!)$/.test(before.title))return record;
        await page.waitForFunction(()=>{
          const visible=el=>Boolean(el&&!el.hidden&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility==='visible'&&el.getClientRects().length);
          const canvas=document.querySelector('canvas'),gl=canvas&&(canvas.getContext('webgl2')||canvas.getContext('webgl'));
          return (visible(document.querySelector('.summary-grid'))&&/^(Game Over|You Win!)$/.test(document.getElementById('title')?.textContent.trim()))||document.hidden||!document.hasFocus()||visible(document.getElementById('settingsModal'))||visible(document.getElementById('bootError'))||window.__snakeFailure||!gl||gl.isContextLost();
        },undefined,{timeout:Math.max(1,remaining())});continue;
      }
      if(before.screen==='paused'){
        validateCompletionObservation(before,{paused:true});if(record.resumeCount>=maxResumes)throw Error('Completion native Resume attempt bound exceeded');
        await page.locator('#actionBtn').click({timeout:Math.max(1,remaining())});record.resumeCount++;continue;
      }
      if(before.screen!=='playing')throw Error('Completion cannot operate title or unknown state');
      await page.waitForFunction(()=>{
        const visible=el=>Boolean(el&&!el.hidden&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility==='visible'&&el.getClientRects().length);
        return ['paused','summary'].includes(document.body.dataset.screen)||document.hidden||!document.hasFocus()||visible(document.getElementById('settingsModal'))||visible(document.getElementById('bootError'))||window.__snakeFailure;
      },undefined,{timeout:Math.max(1,remaining())});
    }
    throw Error('Completion deadline exceeded');
  }catch(error){primaryError=error;error.completion=record;throw error;}
  finally{record.elapsedMs=Date.now()-started;if(budget)record.totalElapsedMs=Date.now()-budget.runStartedAt;if(info){if(!budget)await info.attach('bounded-native-completion',{body:JSON.stringify(record),contentType:'application/json'});else try{await info.attach('bounded-native-completion',{body:JSON.stringify(record),contentType:'application/json'});}catch(error){if(!primaryError)throw error;}}}
}
