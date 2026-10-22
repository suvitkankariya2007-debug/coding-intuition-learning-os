import { type Env,type AuthProps,assertOwner } from './config';
import {rotateUpstreamProps} from './auth';
export type MonitorState={enabled:boolean;intervalMinutes:number;nextRunAt:number|null;taskIndex:number;memoryPage:number;cfCursor:number;consecutiveFailures:number;tasks:Record<string,{status:string;checkedAt:string}>;lastRunAt?:string;lastSuccessAt?:string;credentialMode?:'local'|'encrypted'};
export const initialMonitor=():MonitorState=>({enabled:false,intervalMinutes:30,nextRunAt:null,taskIndex:0,memoryPage:1,cfCursor:1,consecutiveFailures:0,tasks:{}});
import {openCredentials} from './credential-crypto';
export {openCredentials,sealCredentials} from './credential-crypto';
export async function monitorCredentials(env:Env,sealed:any){
  if(env.LOCAL_CREDENTIALS){const r=await env.LOCAL_CREDENTIALS.fetch('https://credentials.internal/props');if(!r.ok)throw Error('Reconnect');const p=await r.json() as AuthProps;assertOwner(env,p);if(p.expiresAt<=Date.now())throw Error('Expired');return p;}
  return rotateUpstreamProps(env,await openCredentials(env,sealed));
}
