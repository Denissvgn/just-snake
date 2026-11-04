import { expect } from '@playwright/test';
import { activePresentationDescriptor, activeControlSelector, observationPrimary, observedScore, observePresentation } from './presentation-evidence.mjs';
export const entry = process.env.RELEASE_DIST ? 'index.html' : 'snake-three.html';
export async function open(page, query = '') { await page.goto(`${entry}${query}`); }
export async function start(page) { await activePresentationDescriptor(page); await page.locator(activeControlSelector('primary')).click(); }
export async function finish(page) { await expect(page.locator('#title')).toHaveText(/Game Over|You Win!/, { timeout: 15000 }); }
export async function settings(page, { advanced = false } = {}) {
  await activePresentationDescriptor(page);
  await page.locator(activeControlSelector('settings')).click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  if (!advanced) return;
  const disclosure = page.getByRole('button', { name: /^Advanced graphics/ });
  if (await disclosure.count()) { if (await disclosure.getAttribute('aria-expanded') === 'false') await disclosure.click(); return; }
  const summary = page.locator('summary').filter({ hasText: 'Advanced graphics' });
  if (await summary.count()) { if (!await summary.evaluate(element => element.parentElement.open)) await summary.click(); }
}

export function validateCompletionObservation(value,{paused=false,allowLegacyOriginal=false}={}) {
  observationPrimary(value);
  const legacy = allowLegacyOriginal === true && value.presentation === 'original' && value.presentationDeclared === false && value.renderedPresentation === undefined && value.requestedPresentation === undefined;
  if (!legacy && (value.presentationDeclared !== true || value.renderedPresentation !== value.presentation)) throw Error('Native flow requires the actual completed selected view');
  if(value.presentationError||value.hidden||value.visibility!=='visible'||!value.focused||value.modalVisible||value.bootErrorVisible||value.failure!==null||value.lost!==false||!value.booted)throw Error('Completion requires a healthy visible focused game without modal or recovery failure');
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
export function validateScoreProgressObservation(value,{score=10,comparison='exact',allowLegacyOriginal=false}={}) {
 if(!Number.isSafeInteger(score)||score<1||!['exact','minimum'].includes(comparison))throw Error('Invalid score progress goal');
 validateCompletionObservation(value,{allowLegacyOriginal});
 if(!['playing','paused'].includes(value.screen))throw Error('Score progress rejects premature summary/title/unknown states');
 const actualScore=observedScore(value);
 if(!Number.isSafeInteger(actualScore)||actualScore<0||comparison==='exact'&&actualScore>score)throw Error('Exact Score10 progress was malformed or missed');
 if(value.screen==='paused'){validateCompletionObservation(value,{paused:true,allowLegacyOriginal});return 'paused';}
 return (comparison==='minimum'?actualScore>=score:actualScore===score)?'ready':'waiting';
}
export async function waitForScoreWithNativeResume(page,{score=10,comparison='exact',maxResumes=3,timeoutMs=15000,info,budget=createNativeResumeBudget({maxResumes,timeoutMs})}={}) {
 validateNativeResumeBudget(budget,maxResumes,timeoutMs);if(!Number.isSafeInteger(score)||score<1||!['exact','minimum'].includes(comparison))throw Error('Invalid score progress goal');let primaryError,capturedObservation;const record=budget.record;const remaining=()=>Math.max(0,timeoutMs-(Date.now()-budget.startedAt));
 try{
  while(remaining()>0){
   const before=capturedObservation??await page.evaluate(observePresentation,{expectedPresentation:record.presentation??null});
   record.presentation??=before.presentation;
   capturedObservation=undefined;record.observations.push(Object.freeze({...before,phase:'score-progress'}));if(remaining()<=0)throw Error('Score progress deadline exceeded');
   if(before.presentationDeclared===true&&before.renderedPresentation===undefined&&['playing','paused'].includes(before.screen)&&!before.presentationError&&!before.hidden&&before.visibility==='visible'&&before.focused&&!before.modalVisible&&!before.bootErrorVisible&&before.failure===null&&before.lost===false&&before.booted){
    const pending=await page.waitForFunction(observePresentation,{wait:'rendered',expectedPresentation:record.presentation},{timeout:Math.max(1,remaining())});
    try{capturedObservation=await pending.jsonValue();}finally{await pending.dispose();}continue;
   }
   const status=validateScoreProgressObservation(before,{score,comparison,allowLegacyOriginal:record.legacyOriginal===true});
   if(status==='ready'){record.progressReady=true;return record;}
   if(status==='paused'){
    if(record.resumeCount>=maxResumes)throw Error('Score progress native Resume attempt bound exceeded');
    await page.locator(observationPrimary(before)).click({timeout:Math.max(1,remaining())});record.resumeCount++;continue;
   }
   const handle=await page.waitForFunction(observePresentation,{wait:'progress',score,comparison,expectedPresentation:record.presentation??null},{timeout:Math.max(1,remaining())});
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
  const observe=()=>page.evaluate(observePresentation,{expectedPresentation:record.presentation??null});
  try {
    while(remaining()>0){
      const before=await observe();record.presentation??=before.presentation;record.observations.push(budget?{...before,phase:'completion'}:before);if(budget&&remaining()<=0)throw Error('Shared native progress/completion deadline exceeded');validateCompletionObservation(before,{allowLegacyOriginal:record.legacyOriginal===true});
      if(before.screen==='summary'){
        if(before.summaryVisible&& /^(Game Over|You Win!)$/.test(before.title))return record;
        await page.waitForFunction(observePresentation,{wait:'summary',expectedPresentation:record.presentation??null},{timeout:Math.max(1,remaining())});continue;
      }
      if(before.screen==='paused'){
        validateCompletionObservation(before,{paused:true,allowLegacyOriginal:record.legacyOriginal===true});if(record.resumeCount>=maxResumes)throw Error('Completion native Resume attempt bound exceeded');
        await page.locator(observationPrimary(before)).click({timeout:Math.max(1,remaining())});record.resumeCount++;continue;
      }
      if(before.screen!=='playing')throw Error('Completion cannot operate title or unknown state');
      await page.waitForFunction(observePresentation,{wait:'completion',expectedPresentation:record.presentation??null},{timeout:Math.max(1,remaining())});
    }
    throw Error('Completion deadline exceeded');
  }catch(error){primaryError=error;error.completion=record;throw error;}
  finally{record.elapsedMs=Date.now()-started;if(budget)record.totalElapsedMs=Date.now()-budget.runStartedAt;if(info){if(!budget)await info.attach('bounded-native-completion',{body:JSON.stringify(record),contentType:'application/json'});else try{await info.attach('bounded-native-completion',{body:JSON.stringify(record),contentType:'application/json'});}catch(error){if(!primaryError)throw error;}}}
}
