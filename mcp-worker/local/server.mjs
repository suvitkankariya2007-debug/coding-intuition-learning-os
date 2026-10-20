import { safeDiagnostic } from './diagnostics.mjs';
import { Miniflare } from 'miniflare';
import { join } from 'node:path';
import { CredentialFile, MemoryCredentials } from './memory-auth.mjs';

export async function startLocal({owner,allowWrites=false,file=new CredentialFile(),port=8787}={}){
  if(port!==8787)throw Error('Local MCP transport uses port 8787.');
  await file.prepare();const credentials=new MemoryCredentials(owner,{file});
  // Fail before listening unless a real, owner-verified login exists.
  await credentials.getProps();
  const mf=new Miniflare({host:'127.0.0.1',port,modules:true,scriptPath:new URL('../dist-tunnel/tunnel.js',import.meta.url).pathname,compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],
    durableObjects:{LEARNERS:{className:'LearnerStore',useSQLite:true}},durableObjectsPersist:join(file.directory,'ledger'),
    bindings:{PUBLIC_ORIGIN:'http://127.0.0.1:8787',OWNER_SUPERMEMORY_ID:owner,MEMORY_NAMESPACE:'leetcode_problems',MEMORY_READ_NAMESPACES:process.env.CODING_INTUITION_MEMORY_READ_NAMESPACES||'leetcode_problems,leetcode',LOCAL_WRITE_ENABLED:String(allowWrites),LEETCODE_USERNAME:'suvitk',CODEFORCES_HANDLE:'suvitkankariya2007',GITHUB_SOLUTIONS_REPO:'suvitkankariya2007-debug/LeetCode-Challenge'},
    serviceBindings:{LOCAL_CREDENTIALS:async()=>{try{return Response.json(await credentials.getProps());}catch{return new Response('Supermemory sign-in required',{status:503});}}},
  });
  await mf.ready;return mf;
}
if(import.meta.url===new URL(process.argv[1],'file:').href){
  try{
    const args=process.argv.slice(2),owner=args.find(a=>!a.startsWith('--'));
    if(args.some(a=>a.startsWith('--')&&a!=='--allow-writes'))throw Error('Unknown option');
    const mf=await startLocal({owner,allowWrites:args.includes('--allow-writes')});
    console.log('Private MCP ready at http://127.0.0.1:8787/mcp. Run the existing tunnel-client separately. Writes '+(args.includes('--allow-writes')?'enabled':'disabled')+'. No deployment was made.');
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>mf.dispose().then(()=>process.exit(0)));
  }catch(error){console.error('Local MCP could not start. '+safeDiagnostic(error));process.exitCode=1;}
}
