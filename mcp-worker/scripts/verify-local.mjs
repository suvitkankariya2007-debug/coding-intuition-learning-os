import { spawnSync } from 'node:child_process';

// Uses installed dependencies and a simulated upstream. Never deploys or registers an account.
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' };
for (const path of ['local/diagnostics.mjs','local/memory-auth.mjs','local/login.mjs','local/server.mjs','local/doctor.mjs','local/monitor.mjs','scripts/demo-adaptive.mjs']) {
  const checked=spawnSync(process.execPath,['--check',path],{cwd:new URL('../',import.meta.url),env,stdio:'inherit'});
  if(checked.error)throw checked.error;
  if(checked.status!==0)process.exit(checked.status??1);
}
for (const task of ['check', 'build', 'build:tunnel', 'test']) {
  const run = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', task], {
    cwd: new URL('../', import.meta.url), env, stdio: 'inherit',
  });
  if (run.error) throw run.error;
  if (run.status !== 0) process.exit(run.status ?? 1);
}
console.log('Local verification passed. No deployment or live account authorization was performed.');
