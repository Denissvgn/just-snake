import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Exact suite declarations, independent of any directory-wide filename pattern.
export const LEGACY_FIXTURES = Object.freeze({
  'test_arena.mjs':'__dbg_arena.html', 'test_attract.mjs':'__dbg_attract.html',
  'test_bloom.mjs':'__dbg_bloom.html', 'test_camera.mjs':'__dbg_camera.html',
  'test_death.mjs':'__dbg_death.html', 'test_eat.mjs':'__dbg_eat.html',
  'test_game.mjs':'__dbg_game.html', 'test_luma.mjs':'__dbg_luma.html',
  'test_paths.mjs':'__dbg_paths.html', 'test_prey.mjs':'__dbg_prey.html',
  'test_raycast.mjs':'__dbg_ray.html', 'test_skin.mjs':'__dbg_skin.html',
  'test_speed.mjs':'__dbg_speed.html', 'test_tube.mjs':'__dbg_tube.html'
});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function registerFixture(root, directory, suite, filename) {
  if (LEGACY_FIXTURES[suite] !== filename) throw new Error(`Undeclared legacy fixture: ${suite}/${filename}`);
  const bytes = await fs.readFile(path.join(root, filename));
  await fs.writeFile(path.join(directory, 'owned-fixture.json'), JSON.stringify({suite,filename,sha256:digest(bytes)}));
}
export async function cleanupFixture(root, directory, suite) {
  let entry;
  try { entry = JSON.parse(await fs.readFile(path.join(directory,'owned-fixture.json'))); }
  catch (error) { if (error.code === 'ENOENT') return {removed:false,reason:'none_registered'}; throw error; }
  if (entry.suite !== suite || LEGACY_FIXTURES[suite] !== entry.filename) throw new Error('Invalid child fixture ownership');
  const filename = path.join(root, entry.filename);
  let bytes;
  try { bytes = await fs.readFile(filename); }
  catch (error) { if (error.code === 'ENOENT') return {removed:false,reason:'child_already_removed'}; throw error; }
  if (digest(bytes) !== entry.sha256) return {removed:false,reason:'changed_after_registration'};
  await fs.rm(filename);
  return {removed:true,filename:entry.filename};
}
