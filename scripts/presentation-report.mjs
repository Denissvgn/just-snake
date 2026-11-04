import {createHash} from 'node:crypto';
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
export const observationDigest = value => createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
// Observed render/UI evidence shared by reporting and release acceptance.
export const PRESENTATIONS = Object.freeze(['original', 'neon-district']);
export function acceptanceIds(title) {
  const prefix = String(title).match(/^(?:ACC-[A-Z0-9]+-\d+\s+)+/)?.[0] || '';
  return [...new Set(prefix.match(/ACC-[A-Z0-9]+-\d+/g) || [])];
}
export function validatePresentationObservation(value) {
  if (!value || !PRESENTATIONS.includes(value.presentation) ||
      value.presentationDeclared !== true || value.renderedPresentation !== value.presentation ||
      !PRESENTATIONS.includes(value.requestedPresentation) ||
      value.presentationError !== null || value.failure !== null ||
      value.booted !== true || value.bootErrorVisible !== false || value.lost !== false ||
      value.boardVisible !== true || value.canvasCount !== 1 ||
      !Number.isSafeInteger(value.renderedFrames) || value.renderedFrames < 1 ||
      !Number.isFinite(value.capturedAt) || value.capturedAt < 0 ||
      !['title', 'playing', 'paused', 'summary'].includes(value.screen) ||
      !Number.isFinite(value.boardBounds?.width) || value.boardBounds.width <= 0 ||
      !Number.isFinite(value.boardBounds?.height) || value.boardBounds.height <= 0) {
    throw Error('Missing actual completed presentation observation');
  }
  const neon = value.presentation === 'neon-district';
  if (value.action?.selector !== (neon ? '#neonActionBtn' : '#actionBtn') ||
      value.scoreSelector !== (neon ? '#neonScore' : '#score')) throw Error('Stale presentation controls');
  if (typeof value.modalVisible !== 'boolean' || value.hidden !== false || value.visibility !== 'visible' || value.focused !== true) throw Error('Presentation witness lacks visible focused UI');
  if (!value.modalVisible && ['title', 'paused', 'summary'].includes(value.screen) &&
      (value.action.visible !== true || value.action.enabled !== true)) throw Error('Active presentation action is unreachable');
  if (!value.modalVisible && neon && value.screen === 'playing' &&
      (value.action.visible !== true || value.action.enabled !== false || value.action.text !== 'Running')) throw Error('Neon playing action must truthfully be disabled Running');
  if (value.screen === 'playing') {
    const match = (neon ? /^(\d{5,})$/ : /^Score: (0|[1-9]\d*)$/).exec(value.scoreText || '');
    const score = match ? Number(match[1]) : NaN;
    if (value.scoreVisible !== true || !Number.isSafeInteger(score) || score < 0 ||
        neon && value.scoreText !== String(score).padStart(5, '0')) throw Error('Malformed visible playing score');
  }
  return value.presentation;
}
export function observedPresentations(evidence) {
  if (!Array.isArray(evidence) || !evidence.length) throw Error('Missing presentation evidence');
  const views = new Set();
  for (const record of evidence) {
    if (record?.name !== 'presentation-evidence' || record.contentType !== 'application/json' ||
        !/^[a-f0-9]{64}$/.test(record.sha256 || '') || record.observationSha256 !== observationDigest(record.observation)) throw Error('Invalid presentation attachment provenance');
    views.add(validatePresentationObservation(record.observation));
  }
  return [...views].sort();
}
export function validateRequiredPresentations(required, localIds) {
  if (!required || typeof required !== 'object' || Array.isArray(required)) throw Error('Presentation contract required');
  for (const [id, views] of Object.entries(required)) {
    if (!localIds.includes(id) || !Array.isArray(views) || !views.length ||
        views.some(view => !PRESENTATIONS.includes(view)) || new Set(views).size !== views.length) {
      throw Error('Unknown or malformed required presentations');
    }
  }
  for (const id of localIds) if (id.startsWith('ACC-PRES-') && !Object.hasOwn(required, id)) throw Error('Incomplete presentation contract ' + id);
  return required;
}
export function validateRowPresentations(row, required = false) {
  if (!required && row.presentations === undefined && row.presentationEvidence === undefined) return [];
  if (!Array.isArray(row.presentations) || !Array.isArray(row.presentationEvidence) ||
      row.presentations.some(view => !PRESENTATIONS.includes(view)) || new Set(row.presentations).size !== row.presentations.length) {
    throw Error('Missing or malformed observed presentations');
  }
  const observed = row.presentationEvidence.length ? observedPresentations(row.presentationEvidence) : [];
  if (JSON.stringify([...row.presentations].sort()) !== JSON.stringify(observed)) throw Error('Presentation labels lack matching observations');
  return observed;
}
export function validatePresentationMatrix(rows, {requiredPresentations, requiredTargets, engines, localIds}) {
  validateRequiredPresentations(requiredPresentations, localIds);
  const actual = new Map();
  for (const row of rows) actual.set(row, validateRowPresentations(row, Object.hasOwn(requiredPresentations, row.id)));
  for (const [id, views] of Object.entries(requiredPresentations)) for (const engine of engines) for (const target of requiredTargets[id]) {
    const observed = new Set(rows.filter(row => row.id === id && row.engine === engine && row.target === target && row.passed === true).flatMap(row => actual.get(row)));
    for (const view of views) if (!observed.has(view)) throw Error(`Missing presentation matrix ${id}:${engine}:${target}:${view}`);
  }
  return true;
}
export async function presentationAttachments(results, directory) {
  const fs = await import('node:fs/promises'), path = await import('node:path');
  const {createHash} = await import('node:crypto');
  const evidence = [], root = await fs.realpath(directory);
  for (const result of results.filter(result => result.status === 'passed')) for (const attachment of result.attachments || []) {
    if (attachment.name !== 'presentation-evidence') continue;
    if (attachment.contentType !== 'application/json' || result.status !== 'passed') throw Error('Nonpassing or invalid presentation attachment');
    let bytes, provenance;
    if (typeof attachment.body === 'string') {
      if (attachment.body.length > 90000 || attachment.body.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(attachment.body)) throw Error('Invalid inline presentation attachment');
      bytes = Buffer.from(attachment.body, 'base64'); provenance = {kind: 'inline'};
    } else if (typeof attachment.path === 'string') {
      const file = await fs.realpath(path.isAbsolute(attachment.path) ? attachment.path : path.resolve(root, attachment.path));
      if (!file.startsWith(root + path.sep) || !(await fs.stat(file)).isFile()) throw Error('Presentation attachment escaped owned report');
      bytes = await fs.readFile(file); provenance = {kind: 'file', path: path.relative(root, file)};
    } else throw Error('Missing presentation attachment bytes');
    if (!bytes.length || bytes.length > 65536) throw Error('Oversized presentation attachment');
    const observation = JSON.parse(bytes); validatePresentationObservation(observation);
    evidence.push({name: attachment.name, contentType: attachment.contentType, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, attachment: provenance, observationSha256: observationDigest(observation), observation});
  }
  return {presentations: evidence.length ? observedPresentations(evidence) : [], presentationEvidence: evidence};
}
