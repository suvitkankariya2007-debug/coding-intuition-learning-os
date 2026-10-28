import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {workerRoot,writeBuildState} from '../local/build-state.mjs';
const run=spawnSync(process.execPath,[join(workerRoot,'node_modules/wrangler/bin/wrangler.js'),'deploy','--dry-run','--config','wrangler.tunnel.jsonc','--outdir','dist-tunnel'],{cwd:workerRoot,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
if(run.error||run.status!==0)process.exit(run.status??1);
await writeBuildState();
