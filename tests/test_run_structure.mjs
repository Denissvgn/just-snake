#!/usr/bin/env node
/* SPEC-G4 §4.2 — Acceptance Suite for Run Structure & Summary.
   Asserts run metrics tracking, pause freeze, end-of-run summary card,
   top-10 leaderboard persistence, share formatting, reachable victory,
   attract mode isolation, and clean reset.
*/

import puppeteer from './helpers/legacy-browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SRC = process.env.GAME || path.join(ROOT, 'snake-three.html');

let failures = 0;
const check = (label, ok, detail) => {
  if (ok) {
    console.log(`  PASS  ${label}${detail ? ' — ' + detail : ''}`);
  } else {
    console.error(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
};

async function run() {
  console.log('[SPEC-G4 Acceptance Run]');

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader-webgl']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 700 });
    await page.goto('http://localhost:8099/snake-three.html');
    await page.waitForSelector('#overlay');
    await new Promise(r => setTimeout(r, 400));

    // 1. Controller Initial State
    const initStats = await page.evaluate(() => {
      if (!window.RUN_STATS) return null;
      return {
        on: window.RUN_STATS.ON,
        targetLength: window.RUN_STATS.TARGET_LENGTH,
        timeAlive: window.RUN_STATS.timeAlive,
        maxSpeed: window.RUN_STATS.maxSpeedLevel,
        maxCombo: window.RUN_STATS.maxCombo,
        eats: window.RUN_STATS.foodBreakdown?.total || 0,
        shareHidden: document.getElementById('shareBtn')?.classList.contains('hidden'),
        lbHidden: document.getElementById('leaderboardBtn')?.classList.contains('hidden')
      };
    });

    check('RUN_STATS controller initialized on window', initStats !== null);
    check('Initial time alive is 0.0s', initStats?.timeAlive === 0, `timeAlive: ${initStats?.timeAlive}`);
    check('Initial maxSpeed is 1 and maxCombo is 1', initStats?.maxSpeed === 1 && initStats?.maxCombo === 1);
    check('Share and Leaderboard buttons hidden on ready screen', initStats?.shareHidden && initStats?.lbHidden);

    // 2. Metrics Accumulation & Pause Freeze
    await page.evaluate(() => {
      window.startGame();
      window.advanceSimulation(80);
      window.advanceSimulation(80);
    });
    const playingTime = await page.evaluate(() => window.RUN_STATS.timeAlive);
    check('Time alive accumulates during active play', playingTime > 0.15, `timeAlive: ${playingTime.toFixed(3)}s`);

    const pauseCheck = await page.evaluate(() => {
      window.pauseGame();
      const t1 = window.RUN_STATS.timeAlive;
      window.advanceSimulation(100);
      window.advanceSimulation(100);
      const t2 = window.RUN_STATS.timeAlive;
      return { t1, t2 };
    });
    check('Time alive strictly freezes while paused', pauseCheck.t1 === pauseCheck.t2, `t1: ${pauseCheck.t1} === t2: ${pauseCheck.t2}`);

    // 3. Prey Consumption & Multiplier Tracking
    await page.evaluate(() => {
      window.resumeGame();
      window.RUN_STATS.recordEat('common', 1, 10);
      window.RUN_STATS.recordEat('golden', 2, 80);
      window.RUN_STATS.recordEat('jittery', 3, 60);
    });

    const eatMetrics = await page.evaluate(() => ({
      breakdown: window.RUN_STATS.foodBreakdown,
      maxCombo: window.RUN_STATS.maxCombo
    }));

    check('Food consumption tracks breakdown counts',
      eatMetrics.breakdown.common === 1 &&
      eatMetrics.breakdown.golden === 1 &&
      eatMetrics.breakdown.jittery === 1 &&
      eatMetrics.breakdown.total === 3,
      JSON.stringify(eatMetrics.breakdown));
    check('Max combo updates from consumed prey', eatMetrics.maxCombo === 3, `maxCombo: ${eatMetrics.maxCombo}`);

    // 4. End-of-Run Summary & Overlay Population
    const summary = await page.evaluate(() => {
      return window.RUN_STATS.finalize('wall');
    });

    check('finalize() returns complete summary object',
      summary && summary.finalScore !== undefined && summary.finalLength !== undefined && summary.deathReason === 'wall');

    const overlayState = await page.evaluate(() => {
      const title = document.getElementById('title')?.textContent || '';
      const msgHtml = document.getElementById('message')?.innerHTML || '';
      const shareBtn = document.getElementById('shareBtn');
      const lbBtn = document.getElementById('leaderboardBtn');
      return {
        title,
        hasStatGrid: msgHtml.includes('summary-grid') || msgHtml.includes('stat-card') || msgHtml.includes('stat-row'),
        hasScore: msgHtml.includes('Score') || msgHtml.includes('score'),
        hasTime: msgHtml.includes('Time') || msgHtml.includes('time'),
        shareVisible: shareBtn && !shareBtn.classList.contains('hidden'),
        lbVisible: lbBtn && !lbBtn.classList.contains('hidden')
      };
    });

    check('End-of-run title preserved for backward compatibility', /Game Over/i.test(overlayState.title), `title: ${overlayState.title}`);
    check('Overlay message renders structured stats grid', overlayState.hasStatGrid && overlayState.hasScore && overlayState.hasTime);
    check('Share and Leaderboard buttons become visible on Game Over', overlayState.shareVisible && overlayState.lbVisible);

    // 5. Leaderboard Persistence & Sorting
    await page.evaluate(() => {
      window.RUN_STATS.clearLeaderboard();
      for (const [value,length,combo,level] of [[100,10,2,4],[250,20,4,9],[180,15,3,7]]) {
        window.startGame();window.pauseGame();window.score=value;
        while(window.segs.length<length)window.segs.push(window.makeBodyCell(0,0));
        window.RUN_STATS.maxCombo=combo;window.RUN_STATS.maxSpeedLevel=level;
        window.RUN_STATS.foodBreakdown={common:length-3,golden:0,jittery:0,total:length-3};
        window.RUN_STATS.timeAlive=value/10;window.RUN_STATS.finalize('wall');
      }
    });

    const lb = await page.evaluate(() => window.RUN_STATS.getLeaderboard());
    check('Leaderboard stores runs sorted descending by score',
      lb.length === 3 && lb[0].score === 250 && lb[1].score === 180 && lb[2].score === 100,
      `scores: ${lb.map(r => r.score).join(', ')}`);

    // 6. Share Formatter
    const shareText = await page.evaluate(() => {
      return window.RUN_STATS.formatShareText({
        descriptor: Object.freeze({rulesVersion:2,mode:'classic',seed:'legacy-share-vector',category:'custom',isDaily:false,dailyDate:null}),
        finalScore: 250,
        finalLength: 20,
        timeSec: 80,
        maxSpeedLevel: 6,
        maxCombo: 4,
        outcome: 'wall',
        foodBreakdown: { common: 10, golden: 2, jittery: 3, total: 15 },
        isNewBest: true
      });
    });

    check('formatShareText produces the exact DEC08 playable card',
      typeof shareText === 'string' &&
      shareText.includes('Score: 250') &&
      shareText.includes('Length: 20') &&
      shareText.startsWith('just-snake — Classic | Custom challenge\n') &&
      shareText.includes('Best combo: x4 | Top speed: 6') &&
      shareText.includes('Result: wall\nPlay this challenge: http://') &&
      new URL(shareText.split('Play this challenge: ')[1]).search === '?seed=legacy-share-vector&mode=classic&rules=2' &&
      shareText.split('\n').length === 5,
      shareText.split('\n')[0]);

    // 7. Attract Mode Isolation
    const preAttractLbLen = await page.evaluate(() => window.RUN_STATS.getLeaderboard().length);
    await page.evaluate(() => {
      window.startAttract(true);
      window.RUN_STATS.recordEat('golden', 5, 200);
      window.RUN_STATS.finalize('wall');
    });
    const postAttractLbLen = await page.evaluate(() => window.RUN_STATS.getLeaderboard().length);
    check('Attract mode does not save to leaderboard', preAttractLbLen === postAttractLbLen, `before: ${preAttractLbLen} vs after: ${postAttractLbLen}`);

    // 8. Reachable Victory Milestone
    await page.evaluate(() => {
      window.startGame();
      window.RUN_STATS.TARGET_LENGTH = 4;
      window.food.x = 11; window.food.z = 10;
      window.step();
    });
    const winTitle = await page.evaluate(() => document.getElementById('title')?.textContent || '');
    check('Reaching TARGET_LENGTH triggers victory overlay', /Win|Victory/i.test(winTitle), `winTitle: ${winTitle}`);

    // 9. Clean Game Restart Reset
    const restartedStats = await page.evaluate(() => {
      window.startGame();
      return {
        timeAlive: window.RUN_STATS.timeAlive,
        eats: window.RUN_STATS.foodBreakdown.total,
        maxCombo: window.RUN_STATS.maxCombo,
        shareHidden: document.getElementById('shareBtn')?.classList.contains('hidden')
      };
    });

    check('Restart cleans all active metrics and restores initial UI state',
      restartedStats.timeAlive === 0 &&
      restartedStats.eats === 0 &&
      restartedStats.maxCombo === 1 &&
      restartedStats.shareHidden);

  } catch (err) {
    console.error('Test execution error:', err);
    failures++;
  } finally {
    if (browser) await browser.close();
  }

  console.log(`\nAll run structure suite checks complete. Failures: ${failures}`);
  process.exit(failures > 0 ? 1 : 0);
}

run();
