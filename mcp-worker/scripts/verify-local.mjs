import { spawnSync } from 'node:child_process';

// Uses installed dependencies and a simulated upstream. Never deploys or registers an account.
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' };
for (const task of ['check', 'build', 'test']) {
  const run = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', task], {
    cwd: new URL('../', import.meta.url), env, stdio: 'inherit',
  });
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status ?? 1);
}
console.log('Local verification passed. No deployment or live account authorization was performed.');
