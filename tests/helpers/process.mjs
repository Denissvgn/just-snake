import { spawn } from 'node:child_process';
export function evidenceFailed(evidence) {
  return Boolean(evidence.failures?.length || evidence.pages?.some(page => page.pageErrors?.length || page.consoleErrors?.length));
}
export async function runWorker(command, args, { timeoutMs, graceMs = 3000, onSpawn, ...options }) {
  const child = spawn(command, args, { ...options, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  onSpawn?.(child);
  const chunks = [], stdout = [], stderr = []; let timedOut = false, escalation;
  child.stdout.on('data', chunk => { chunks.push(chunk); stdout.push(chunk); }); child.stderr.on('data', chunk => { chunks.push(chunk); stderr.push(chunk); });
  const kill = signal => { try { process.kill(-child.pid, signal); } catch {} };
  const timer = setTimeout(() => { timedOut = true; kill('SIGTERM'); escalation = setTimeout(() => kill('SIGKILL'), graceMs); escalation.unref(); }, timeoutMs);
  const exitCode = await new Promise(resolve => { child.once('error', error => { chunks.push(Buffer.from(error.message)); resolve(1); }); child.once('close', code => resolve(code ?? 1)); });
  clearTimeout(timer); clearTimeout(escalation); kill('SIGKILL');
  return { exitCode, timedOut, output: Buffer.concat(chunks), stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), pid: child.pid };
}
