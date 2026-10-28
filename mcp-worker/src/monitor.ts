import { type Env,type AuthProps,assertOwner } from './config';
import {rotateUpstreamProps} from './auth';
export {initialMonitor,reconcileMonitorSources,type MonitorState} from './monitor-state';
import {openCredentials} from './credential-crypto';
export {openCredentials,sealCredentials} from './credential-crypto';
export async function monitorCredentials(env:Env,sealed:any,expected?:{userId:string;namespace:string}){
  if(env.LOCAL_CREDENTIALS){const r=await env.LOCAL_CREDENTIALS.fetch('https://credentials.internal/props');if(!r.ok)throw Error('Reconnect');const p=await r.json() as AuthProps;assertOwner(env,p);if(expected&&(p.userId!==expected.userId||p.namespace!==expected.namespace))throw Error('Credential tenant mismatch');if(p.expiresAt<=Date.now())throw Error('Expired');return p;}
  return rotateUpstreamProps(env,await openCredentials(env,sealed,expected));
}

