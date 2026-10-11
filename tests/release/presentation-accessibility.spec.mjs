import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../helpers/release-fixture.mjs';
import { open, start, settings, finishWithNativeResume } from '../helpers/player-flow.mjs';
import { attachPresentationEvidence } from '../helpers/presentation-evidence.mjs';
import { localImports, sourceAdapter } from '../helpers/source-adapter.mjs';
import { ROOT } from '../helpers/config.mjs';
const axeSource = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const sizes = [[1600,900],[1440,900],[1000,700],[768,1024],[390,844],[320,568],[844,390]];
const longSeed = '  ' + '雪🐍'.repeat(62) + '  ';
async function prefs(page, extra = {}) {
  await page.addInitScript(extra => localStorage.setItem('threejs-snake-settings', JSON.stringify({ schemaVersion: 2,
    values: { presentation: 'neon-district', quality: 'low', aa: 'none', sound: false, haptics: false, ...extra } })), extra);
}
async function ready(page, seed = 'pack-smoke-15738') {
  await open(page, `?seed=${encodeURIComponent(seed)}&mode=classic&rules=2`);
  await expect(page.locator('body')).toHaveAttribute('data-presentation', 'neon-district');
  await attachPresentationEvidence(page, test.info(), 'neon-district');
  await page.evaluate(() => document.fonts.ready);
}
async function layout(page, stage) {
  const report = await page.evaluate(async stage => {
    const visible = node => !node.closest('[hidden],[inert],[aria-hidden="true"]') &&
      getComputedStyle(node).visibility === 'visible' && [...node.getClientRects()].some(rect => rect.width && rect.height) &&
      ![...node.closest('details') ? [node.closest('details')] : []].some(details => !details.open && !details.querySelector(':scope > summary')?.contains(node));
    const issues = [], controls = [...document.querySelectorAll('button,summary,input,select,textarea')].filter(visible);
    for (const node of controls) {
      const rect = node.getBoundingClientRect(), font = parseFloat(getComputedStyle(node).fontSize);
      if (rect.width < 43.9 || rect.height < 43.9 || font < 13.9) issues.push({ id: node.id, text: node.textContent, width: rect.width, height: rect.height, font });
      if (!node.matches(':disabled')) {
        node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const reached = node.getBoundingClientRect();
        if (reached.left < -.5 || reached.right > innerWidth + .5 || reached.top < -.5 || reached.bottom > innerHeight + .5)
          issues.push({ id: node.id, unreachable: reached.toJSON() });
      }
    }
    const board = document.getElementById('neonBoardViewport').getBoundingClientRect();
    const panels = [...document.querySelectorAll('#overlay .panel,#settingsModal .settings-panel,#neonRankingsDialog .settings-panel')].filter(visible)
      .map(node => ({ id: node.parentElement.id, width: node.clientWidth, scrollWidth: node.scrollWidth, rect: node.getBoundingClientRect().toJSON() }));
    for (const panel of panels) if (panel.scrollWidth > panel.width + 1) issues.push({ clippedPanel: panel });
    return { stage, width: innerWidth, height: innerHeight, board: [board.width, board.height],
      horizontal: document.documentElement.scrollWidth > innerWidth + 1, issues, controls: controls.length, panels };
  }, stage);
  expect(report.horizontal, stage).toBe(false); expect(report.issues, stage).toEqual([]);
  expect(Math.abs(report.board[0] - report.board[1]), stage).toBeLessThanOrEqual(1);
  expect(report.board[0], stage).toBeGreaterThan(100);
  await test.info().attach('neon-layout-' + stage, { body: JSON.stringify(report), contentType: 'application/json' });
  return report;
}
for (const [width,height] of sizes) {
  test(`ACC-PRES-04 ${width}x${height} square board title settings pause and rankings stay reachable`, async ({ gamePage: page }) => {
    await page.setViewportSize({ width, height }); await prefs(page); await ready(page, longSeed);
    expect(await page.locator('#challengeTuple .seed-value').textContent()).toBe(longSeed);
    await layout(page, 'title'); await settings(page, { advanced: true }); await layout(page, 'settings');
    await page.locator('#closeSettingsBtnAction').click(); await start(page);
    await layout(page, 'playing');
    if (await page.locator('body').getAttribute('data-screen') === 'playing') await page.locator('#neonPauseBtn').click();
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused'); await layout(page, 'pause');
    await page.locator('#neonRankingsBtn').click(); await layout(page, 'rankings');
    if (width === 1000) { await page.emulateMedia({ forcedColors: 'active', contrast: 'no-preference' });
      await layout(page, 'rankings-forced-colors'); await page.emulateMedia({ forcedColors: 'none' }); }
    await page.locator('#neonRankingsDoneBtn').click(); await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  });
}

test('ACC-PRES-04 computed 200percent text and zoom-equivalent reflow honor actual horizontal safe insets', async ({ gamePage: page }) => {
  await page.setViewportSize({ width: 720, height: 450 }); await prefs(page); await ready(page, longSeed);
  const before = await page.evaluate(() => Object.fromEntries(['neonScore','neonActionBtn','neonContext'].map(id => [id, parseFloat(getComputedStyle(document.getElementById(id)).fontSize)])));
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px';
    for (const [key,value] of [['top',18],['bottom',20],['left',44],['right',36]]) document.documentElement.style.setProperty('--safe-' + key, value + 'px'); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const after = await page.evaluate(() => ({ fonts: Object.fromEntries(['neonScore','neonActionBtn','neonContext'].map(id => [id, parseFloat(getComputedStyle(document.getElementById(id)).fontSize)])),
    cabinet: document.getElementById('neonCabinet').getBoundingClientRect().toJSON(), width: innerWidth,
    header: document.querySelector('.neon-header').getBoundingClientRect().toJSON(), pause: document.getElementById('neonPauseBtn').getBoundingClientRect().toJSON(),
    lettering: ['.neon-wordmark','.neon-edition'].map(selector => {const node=document.querySelector(selector),range=document.createRange();range.selectNodeContents(node);return {selector,rect:range.getBoundingClientRect().toJSON()};}) }));
  for (const id of Object.keys(before)) expect(after.fonts[id]).toBe(before[id] * 2);
  expect(after.cabinet.left).toBeGreaterThanOrEqual(44); expect(after.cabinet.right).toBeLessThanOrEqual(after.width - 36);
  for(const lettering of after.lettering){expect(lettering.rect.left).toBeGreaterThanOrEqual(after.header.left-.5);expect(lettering.rect.right).toBeLessThanOrEqual(after.pause.left+.5);}
  await layout(page, 'root-text32-safe'); await settings(page, { advanced: true }); await layout(page, 'root-text32-settings');
  await page.locator('#closeSettingsBtnAction').click(); await page.locator('#neonRankingsBtn').click(); await layout(page, 'root-text32-rankings');
  await test.info().attach('neon-text-scale-method', { body: JSON.stringify({ before, after,
    method: 'Computed root16→32px fonts,720x450 CSS viewport equivalent to1440x900 at200%; simulatedactualsafeinsets44/36. No physicalzoom/deviceclaim.' }), contentType: 'application/json' });
});

async function axe(page, stage) {
  const result = await page.evaluate(async () => (await window.axe.run({ runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations
    .map(violation => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })));
  await test.info().attach('neon-axe-' + stage, { body: JSON.stringify(result), contentType: 'application/json' });
  expect(result, stage + ' WCAG axe violations').toEqual([]);
}
test('ACC-PRES-05 axe keyboard pressed state and active view focus cover actual title play pause settings summary rankings', async ({ gamePage: page }) => {
  await prefs(page); await ready(page); await page.addScriptTag({ content: axeSource });
  await axe(page, 'title'); await start(page); await axe(page, 'playing');
  if (await page.locator('body').getAttribute('data-screen') === 'playing') await page.locator('#neonPauseBtn').click();
  await axe(page, 'pause'); await settings(page); await axe(page, 'settings');
  const pressed = await page.locator('#settingsModeSelector button,.presentation-pill,#motionToggleBtn,#contrastToggleBtn').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-pressed')));
  expect(pressed.every(value => ['true','false'].includes(value))).toBe(true);
  await page.locator('#closeSettingsBtn').focus();
  for (let n = 0; n < 12; n++) { await page.keyboard.press(n < 6 ? 'Tab' : 'Shift+Tab');
    expect(await page.evaluate(() => document.activeElement.closest('#settingsModal') !== null)).toBe(true); }
  await page.locator('#settingsPresentationSelector [data-presentation-choice="original"]').click();
  await page.keyboard.press('Escape'); await attachPresentationEvidence(page, test.info(), 'original');
  await expect(page.locator('#actionBtn')).toBeFocused();
  await settings(page); await page.locator('#settingsPresentationSelector [data-presentation-choice="neon-district"]').click();
  await page.keyboard.press('Escape'); await attachPresentationEvidence(page, test.info(), 'neon-district');
  await expect(page.locator('#neonActionBtn')).toBeFocused();
  await page.locator('#neonActionBtn').click(); await finishWithNativeResume(page, { info: test.info() }); await axe(page, 'summary');
  await page.locator('#neonRankingsBtn').click(); await axe(page, 'rankings');
  await page.keyboard.press('Escape'); await expect(page.locator('#neonRankingsBtn')).toBeFocused();
});

test('ACC-PRES-05 explicit text/component/focus contrast and inherited motion/colorblind/highcontrast survive forced colors', async ({ gamePage: page }) => {
  await prefs(page); await ready(page);
  const contrast = await page.evaluate(() => {
    const rgb = value => value.match(/[\d.]+/g).slice(0,3).map(Number);
    const luminance = color => color.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      .reduce((sum,value,index) => sum + value * [.2126,.7152,.0722][index],0);
    const ratio = (a,b) => { const x=luminance(a),y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
    const panel = [9,20,27], peak = [28,50,59];
    return { text: ['neonScore','neonBest','neonContext','neonHint'].map(id => ({ id, ratio: ratio(rgb(getComputedStyle(document.getElementById(id)).color),panel) })),
      components: ['neonSettingsBtn','neonSpeedMeter'].map(id => { const node=document.getElementById(id),style=getComputedStyle(id==='neonSpeedMeter'?node.firstElementChild:node);return {id,ratio:ratio(rgb(style.borderTopColor),id==='neonSpeedMeter'?[5,17,22]:peak)}; }) };
  });
  for (const sample of contrast.text) expect(sample.ratio, sample.id).toBeGreaterThanOrEqual(4.5);
  for (const sample of contrast.components) expect(sample.ratio, sample.id).toBeGreaterThanOrEqual(3);
  await page.locator('#neonActionBtn').focus(); await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {const style=getComputedStyle(document.activeElement),color=style.outlineColor.match(/[\d.]+/g).slice(0,3).map(Number);
    const lum=values=>values.map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
    return {width:parseFloat(style.outlineWidth),style:style.outlineStyle,color:style.outlineColor,ratio:(lum(color)+.05)/(lum([28,50,59])+.05)};});
  expect(focus.width).toBeGreaterThanOrEqual(2); expect(focus.style).toBe('solid');
  expect(focus.ratio).toBeGreaterThanOrEqual(3);
  await page.emulateMedia({reducedMotion:'no-preference',contrast:'no-preference',forcedColors:'active'});
  await expect(page.locator('body')).not.toHaveClass(/high-contrast/);
  expect(await page.locator('body').evaluate(node=>getComputedStyle(node).backgroundImage)).toBe('none');
  await layout(page,'forced-colors-alone');
  await page.emulateMedia({forcedColors:'none'});
  await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
  await expect(page.locator('body')).toHaveClass(/reduced-motion/); await expect(page.locator('body')).toHaveClass(/high-contrast/);
  await settings(page); await page.locator('#palettePills [data-palette="colorblind"]').click();
  await expect(page.locator('#palettePills [data-palette="colorblind"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#motionToggleBtn')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#contrastToggleBtn')).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape'); await page.emulateMedia({ forcedColors: 'active' });
  await layout(page, 'forced-colors');
  await test.info().attach('neon-contrast-samples', { body: JSON.stringify({ contrast, focus, method: 'Explicitauthoredpanel/gradientpeak RGB bounds plusactualcomputedcontrol/meter edges; decorativegridnotcountedascontrol.' }), contentType: 'application/json' });
});

test.describe('Neon board pointer and dialog scroll', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('ACC-PRES-04 native board-only capture release and dialog scrolling never steer from UI', async ({ gamePage: page }, info) => {
    await prefs(page); await ready(page, 'touch-neon'); await start(page);
    await page.evaluate(() => { window.__neonCapture=[];window.addEventListener('gotpointercapture',event=>window.__neonCapture.push(['got',event.pointerId]));window.addEventListener('lostpointercapture',event=>window.__neonCapture.push(['lost',event.pointerId])); });
    await page.locator('canvas').scrollIntoViewIfNeeded(); const box=await page.locator('canvas').boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-45);
    await expect(page.locator('#radialPad')).toHaveCSS('opacity','1');await page.mouse.up();await expect(page.locator('#radialPad')).toHaveCSS('opacity','0');
    const events=await page.evaluate(()=>window.__neonCapture);expect(events.some(event=>event[0]==='got')).toBe(true);expect(events.some(event=>event[0]==='lost')).toBe(true);
    await page.locator('#neonContext').click();await expect(page.locator('#radialPad')).toHaveCSS('opacity','0');
    await settings(page,{advanced:true});const panel=page.locator('#settingsModal .settings-panel');
    await panel.hover();await page.mouse.wheel(0,1800);await expect.poll(()=>panel.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator('#radialPad')).toHaveCSS('opacity','0');await page.locator('#closeSettingsBtnAction').scrollIntoViewIfNeeded();
    const done=await page.locator('#closeSettingsBtnAction').boundingBox();await page.touchscreen.tap(done.x+done.width/2,done.y+done.height/2);
    await expect(page.locator('#settingsModal')).toBeHidden();await expect(page.locator('body')).toHaveAttribute('data-screen','paused');
    await info.attach('neon-native-pointer-method',{body:JSON.stringify({events,method:'Nativebrowsermousepointercapture/release andwheel plus emulatedtouchClose; nophysicaldevicecertification'}),contentType:'application/json'});
  });
});

test('ACC-PRES-04 native fullscreen capability reflects outcome and keeps one square arena', async ({ gamePage: page }) => {
  await prefs(page);await ready(page);
  const button=page.locator('#neonFullscreenBtn');
  if(await button.isEnabled()){
    await button.click();await page.waitForFunction(()=>{const node=document.getElementById('neonFullscreenBtn');return node.getAttribute('aria-pressed')==='true'||node.textContent.includes('unavailable');},undefined,{timeout:8000});
    const entered=await page.evaluate(()=>Boolean(document.fullscreenElement||document.webkitFullscreenElement));
    if(entered){await expect(button).toHaveAttribute('aria-pressed','true');await layout(page,'fullscreen');await button.click();await expect(button).toHaveAttribute('aria-pressed','false');}
    else{await expect(button).toBeDisabled();await expect(button).toContainText('unavailable');}
  }else await expect(button).toContainText('unavailable');
  await layout(page,'fullscreen-return');expect(await page.locator('canvas').count()).toBe(1);
});

test('ACC-PRES-04 portrait paused header keeps Resume whole inside its control at320 and390 with normal and doubled text', async ({ gamePage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await prefs(page); await ready(page, longSeed);
  await start(page);
  if (await page.locator('body').getAttribute('data-screen') === 'playing') await page.locator('#neonPauseBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  const rows = [];
  for (const width of [320,390]) for (const rootText of [16,32]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.evaluate(rootText => {
      document.documentElement.style.fontSize = rootText + 'px';
      document.documentElement.style.setProperty('--safe-left', '24px');
      document.documentElement.style.setProperty('--safe-right', '20px');
      window.scrollTo(0,0);
    }, rootText);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const row = await page.evaluate(() => {
      const button = document.getElementById('neonPauseBtn'), caption = document.getElementById('neonPauseLabel');
      const range = document.createRange(); range.selectNodeContents(caption);
      const header = document.querySelector('.neon-header').getBoundingClientRect(), bounds = button.getBoundingClientRect();
      return { viewport: innerWidth, rootText: parseFloat(getComputedStyle(document.documentElement).fontSize),
        caption: caption.textContent, captionFont: parseFloat(getComputedStyle(caption).fontSize),
        captionLines: [...range.getClientRects()].filter(rect => rect.width && rect.height).map(rect => rect.toJSON()),
        button: bounds.toJSON(), header: header.toJSON(), horizontal: document.documentElement.scrollWidth > innerWidth + 1,
        lettering: ['.neon-wordmark','.neon-edition'].map(selector => { const text = document.createRange();
          text.selectNodeContents(document.querySelector(selector)); return { selector, rect: text.getBoundingClientRect().toJSON() }; }) };
    });
    expect(row.caption).toBe('Resume'); expect(row.captionFont).toBe(rootText * .875);
    expect(row.captionLines).toHaveLength(1); expect(row.horizontal).toBe(false);
    expect(row.button.width).toBeGreaterThanOrEqual(44); expect(row.button.height).toBeGreaterThanOrEqual(44);
    expect(row.button.left).toBeGreaterThanOrEqual(row.header.left - .5);
    expect(row.button.right).toBeLessThanOrEqual(row.header.right + .5);
    const caption = row.captionLines[0];
    expect(caption.left).toBeGreaterThanOrEqual(row.button.left); expect(caption.right).toBeLessThanOrEqual(row.button.right);
    expect(caption.top).toBeGreaterThanOrEqual(row.button.top); expect(caption.bottom).toBeLessThanOrEqual(row.button.bottom);
    for (const lettering of row.lettering) {
      expect(lettering.rect.left).toBeGreaterThanOrEqual(row.header.left - .5);
      expect(lettering.rect.right).toBeLessThanOrEqual(row.button.left - 4);
    }
    rows.push(row);
  }
  await test.info().attach('portrait-paused-caption-geometry', { body: JSON.stringify({
    method: 'Actual native Start/Pause with long opaque seed; live text Range single-line and bounds, actual16→32px typography, simulated24/20px safe insets. No physical-device claim.', rows }), contentType: 'application/json' });
});

if (!process.env.RELEASE_DIST) {
  test('ACC-PRES-05 source actual suspended composite pass suppresses grain time and CA then restores exact Original grades', async({gamePage:page})=>{
    await prefs(page,{quality:'balanced'});await page.route('**/snake-three.html*',async route=>{const response=await route.fetch();const hooks=`window.__neonComposite=()=>{renderer.setAnimationLoop(null);const original=renderer.render,saved={grain:compMat.uniforms.grain.value,time:compMat.uniforms.time.value,ca:compMat.uniforms.ca.value};let pass=null,thrown='';
      compMat.uniforms.grain.value=.031;compMat.uniforms.time.value=42;compMat.uniforms.ca.value=.12;
      const sample=()=>({grain:compMat.uniforms.grain.value,time:compMat.uniforms.time.value,ca:compMat.uniforms.ca.value});
      renderer.render=function(s,c){if(s===quadScene&&quadMesh.material===compMat){pass=sample();throw Error('Declared suspended-composite draw failure');}return original.call(this,s,c);};
      try{const tuple=PRESENTATION.resolveView();try{renderFrame(tuple);}catch(error){thrown=error.message;}return {suspended:tuple.options.suspendDecor,pass,after:sample(),thrown};}
      finally{renderer.render=original;for(const[key,value]of Object.entries(saved))compMat.uniforms[key].value=value;renderer.setAnimationLoop(animate);}};`;
      await route.fulfill({response,body:sourceAdapter(localImports(await response.text(),new URL(route.request().url()).origin+'/'),{hooks})});});
    await ready(page);await settings(page);const result=await page.evaluate(()=>window.__neonComposite());
    expect(result).toEqual({suspended:true,pass:{grain:0,time:42,ca:0},after:{grain:.031,time:42,ca:.12},thrown:'Declared suspended-composite draw failure'});
  });

  test('ACC-PRES-05 labelled source native Title fatal error disables every Neon action and focuses Reload', async ({ gamePage: page }) => {
    await prefs(page);await ready(page);await page.addScriptTag({content:axeSource});
    await expect(page.locator('body')).toHaveAttribute('data-screen','title');
    await page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{message:'Labelled ND08 title fatal fixture'})));
    await expect(page.locator('#reloadGameBtn')).toBeFocused();await axe(page,'labelled-title-fatal');
    for(const id of['neonActionBtn','neonPauseBtn','neonRestartBtn','neonSettingsBtn','neonRankingsBtn','neonTitleBtn','neonFullscreenBtn'])await expect(page.locator('#'+id)).toBeDisabled();
  });

  test('ACC-PRES-04 source 320width doubled header text stays inside tracks and board overlay follows position-only reflow', async ({gamePage:page})=>{
    await page.setViewportSize({width:320,height:568});await prefs(page);await ready(page,longSeed);
    const before=await page.locator('#neonBoardViewport').boundingBox();await page.evaluate(()=>document.documentElement.style.fontSize='32px');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
    const after=await page.evaluate(()=>{const header=document.querySelector('.neon-header').getBoundingClientRect(),pause=document.getElementById('neonPauseBtn').getBoundingClientRect(),board=document.getElementById('neonBoardViewport').getBoundingClientRect(),overlay=document.getElementById('overlay').getBoundingClientRect();
      return {header:header.toJSON(),pause:pause.toJSON(),board:board.toJSON(),overlay:overlay.toJSON(),letters:['.neon-wordmark','.neon-edition'].map(selector=>{const range=document.createRange();range.selectNodeContents(document.querySelector(selector));return range.getBoundingClientRect().toJSON();})};});
    expect(after.board.width).toBeCloseTo(before.width,0);expect(after.board.y).not.toBe(before.y);
    expect(Math.abs(after.board.top-after.overlay.top)).toBeLessThanOrEqual(1);expect(Math.abs(after.board.left-after.overlay.left)).toBeLessThanOrEqual(1);
    for(const rect of after.letters){expect(rect.left).toBeGreaterThanOrEqual(after.header.left-.5);expect(rect.right).toBeLessThanOrEqual(after.pause.left+.5);}
    await layout(page,'source320-root32-reflow');
  });

  test('ACC-PRES-04 source representative keymaps held-key and pointer-cancel guards remain active in Neon', async({gamePage:page})=>{
    await prefs(page);await page.route('**/snake-three.html*',async route=>{const response=await route.fetch();const hooks=`window.__neonInput={freeze(){window.arrangeNextMovement(100000);},snap(){return {pointer:MOBILE.pointerId,active:MOBILE.active,queue:inputQueue.map(value=>({...value})),cityVisible:PRESENTATION.view.scene.getObjectByName('Wet city').visible,requestedContrast:SETTINGS.highContrast??null};}};`;
      await route.fulfill({response,body:sourceAdapter(localImports(await response.text(),new URL(route.request().url()).origin+'/'),{hooks})});});
    await ready(page);await page.emulateMedia({contrast:'no-preference',forcedColors:'active'});
    await page.waitForFunction(()=>window.__neonInput.snap().cityVisible===false);expect((await page.evaluate(()=>window.__neonInput.snap())).requestedContrast).toBeNull();
    await page.emulateMedia({forcedColors:'none'});await start(page);await page.evaluate(()=>window.__neonInput.freeze());
    for(const [map,key] of[['ijkl','i'],['hjkl','k']]){
      await settings(page);await page.locator(`#keymapPills [data-keymap="${map}"]`).click();await page.keyboard.press('Escape');await page.locator('#neonActionBtn').click();
      await page.keyboard.down(key);expect((await page.evaluate(()=>window.__neonInput.snap())).queue).toEqual([{x:0,z:-1}]);
      await settings(page);await page.keyboard.press('Escape');await page.locator('#neonActionBtn').click();await page.keyboard.down(key);
      expect((await page.evaluate(()=>window.__neonInput.snap())).queue).toEqual([]);await page.keyboard.up(key);
    }
    await page.evaluate(()=>{const canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId:71,isPrimary:true,pointerType:'touch',button:0,clientX:r.x+r.width/2,clientY:r.y+r.height/2,bubbles:true}));window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:71,bubbles:true}));});
    expect(await page.evaluate(()=>window.__neonInput.snap())).toMatchObject({pointer:null,active:false,queue:[]});
    await test.info().attach('neon-input-fixture-method',{body:JSON.stringify({keyboard:'Native IJKL/HJKL heldrepeat acrossSettings withsource100000ms movement scheduling',cancel:'DeclaredpublicDOM PointerEventcancel, notphysicaltouchcertification',forcedColors:'Actualmediaemulation hidesownedcity withoutpersistingcontrast'}),contentType:'application/json'});
  });

  test('ACC-PRES-04 ACC-PRES-05 labelled source long metrics and fatal-error fixture keep all digits controls and Reload accessible', async ({ gamePage: page }) => {
    await page.setViewportSize({width:320,height:568});await prefs(page);
    await page.route('**/snake-three.html*',async route=>{const response=await route.fetch();const hooks=`window.__neonA11yFixture={metrics(){score=9007199254740990;stepMs=MIN_STEP_MS;PRESENTATION.syncHUD();},error(){RECOVERY.fail('unsupported',new Error('Labelled ND08 unsupported fixture'));}};`;
      await route.fulfill({response,body:sourceAdapter(localImports(await response.text(),new URL(route.request().url()).origin+'/'),{hooks})});});
    await ready(page,longSeed);await start(page);if(await page.locator('body').getAttribute('data-screen')==='playing')await page.locator('#neonPauseBtn').click();
    await page.evaluate(()=>window.__neonA11yFixture.metrics());await expect(page.locator('#neonScore')).toHaveText('9007199254740990');await expect(page.locator('#neonBest')).toHaveText('9007199254740990');await layout(page,'labelled-wide-metrics');
    await page.addScriptTag({content:axeSource});await page.evaluate(()=>window.__neonA11yFixture.error());await expect(page.locator('#reloadGameBtn')).toBeFocused();await axe(page,'labelled-error');
    for(const id of['neonActionBtn','neonPauseBtn','neonRestartBtn','neonSettingsBtn','neonRankingsBtn','neonTitleBtn','neonFullscreenBtn'])await expect(page.locator('#'+id)).toBeDisabled();
    await test.info().attach('neon-source-fixture-scope',{body:JSON.stringify({metrics:'Synthetic safe-integer formatting stress, notlegitimaterun/record',error:'SyntheticunsupportedpolicythroughrealRECOVERY.fail, nothardwarefailure'}),contentType:'application/json'});
  });
}
