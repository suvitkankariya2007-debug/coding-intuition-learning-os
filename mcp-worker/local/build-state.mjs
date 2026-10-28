import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
export const workerRoot=fileURLToPath(new URL('../',import.meta.url));
async function files(directory){const out=[];for(const e of await readdir(directory,{withFileTypes:true})){const p=join(directory,e.name);if(e.isDirectory())out.push(...await files(p));else if(/\.(ts|json|jsonc)$/.test(e.name))out.push(p);}return out;}
export async function sourceFingerprint(root=workerRoot){
 const paths=[...await files(join(root,'src')),...await files(join(root,'../src/lib')),join(root,'package.json'),join(root,'package-lock.json'),join(root,'wrangler.tunnel.jsonc')].sort();
 const hash=createHash('sha256');for(const p of paths)hash.update(relative(root,p)).update('\0').update(await readFile(p)).update('\0');return hash.digest('hex');
}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function writeBuildState(root=workerRoot){const state={sourceFingerprint:await sourceFingerprint(root),bundleFingerprint:digest(await readFile(join(root,'dist-tunnel/tunnel.js')))};await mkdir(join(root,'dist-tunnel'),{recursive:true});await writeFile(join(root,'dist-tunnel/build-state.json'),JSON.stringify(state));return state;}
export async function assertCurrentBuild(root=workerRoot){
 try{const state=JSON.parse(await readFile(join(root,'dist-tunnel/build-state.json'),'utf8'));if(state.sourceFingerprint!==await sourceFingerprint(root)||state.bundleFingerprint!==digest(await readFile(join(root,'dist-tunnel/tunnel.js'))))throw Error('Mismatch');return state;}
 catch{throw Error('LOCAL_BUILD_STALE');}
}
