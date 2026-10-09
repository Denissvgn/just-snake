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
export async function finishWithNativeResume(page,{maxResumes=3,timeoutMs=15000,info}={}) {
  if(!Number.isSafeInteger(maxResumes)||maxResumes<0||maxResumes>3||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)throw Error('Completion bounds must be maxResumes0..3 and timeoutMs1..15000');
  const started=Date.now(),record={resumeCount:0,observations:[],maxResumes,timeoutMs};
  const remaining=()=>Math.max(0,timeoutMs-(Date.now()-started));
  const observe=()=>page.evaluate(()=>{
    const visible=el=>Boolean(el&&!el.hidden&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility==='visible'&&[...el.getClientRects()].some(r=>r.width>0&&r.height>0));
    const canvas=document.querySelector('canvas'),gl=canvas&&(canvas.getContext('webgl2')||canvas.getContext('webgl')),button=document.getElementById('actionBtn');
    return {screen:document.body.dataset.screen,title:document.getElementById('title')?.textContent.trim(),hidden:document.hidden,visibility:document.visibilityState,focused:document.hasFocus(),modalVisible:visible(document.getElementById('settingsModal')),bootErrorVisible:visible(document.getElementById('bootError')),failure:window.__snakeFailure??null,lost:gl?gl.isContextLost():null,booted:window.__snakeBooted===true,summaryVisible:visible(document.querySelector('.summary-grid')),action:{text:button?.textContent.trim(),visible:visible(button),enabled:Boolean(button&&!button.matches(':disabled')&&button.getAttribute('aria-disabled')!=='true')},pauseTelemetry:document.getElementById('pauseTelemetry')?.textContent};
  });
  try {
    while(remaining()>0){
      const before=await observe();record.observations.push(before);validateCompletionObservation(before);
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
  }catch(error){error.completion=record;throw error;}
  finally{record.elapsedMs=Date.now()-started;if(info)await info.attach('bounded-native-completion',{body:JSON.stringify(record),contentType:'application/json'});}
}
