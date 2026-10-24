import {type Env,type AuthProps,assertOwner,multiUserEnabled} from './config';
type Tenant={userId:string;namespace:string};
type Sealed={iv:number[];data:number[];version?:number;userId?:string;namespace?:string};
const aad=(identity:Tenant)=>new TextEncoder().encode(identity.userId+':'+identity.namespace);
async function key(env:Env){if(!/^[a-f0-9]{64}$/i.test(env.MONITOR_ENCRYPTION_KEY??''))throw Error('Monitor key required');return crypto.subtle.importKey('raw',Uint8Array.from(env.MONITOR_ENCRYPTION_KEY!.match(/../g)!,s=>parseInt(s,16)),'AES-GCM',false,['encrypt','decrypt']);}
export async function sealCredentials(env:Env,props:AuthProps){assertOwner(env,props);const iv=crypto.getRandomValues(new Uint8Array(12));const value=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(props)},await key(env),new TextEncoder().encode(JSON.stringify(props)));return {version:2,userId:props.userId,namespace:props.namespace,iv:[...iv],data:[...new Uint8Array(value)]};}
export async function openCredentials(env:Env,sealed:Sealed,expected?:Tenant){
 if(!expected){if(multiUserEnabled(env))throw Error('Expected learner identity required');expected={userId:env.OWNER_SUPERMEMORY_ID,namespace:env.MEMORY_NAMESPACE};}
 assertOwner(env,{...expected,accessToken:'identity-check',expiresAt:1});
 if(sealed.version!==undefined&&sealed.version!==2||sealed.version===2&&(sealed.userId!==expected.userId||sealed.namespace!==expected.namespace))throw Error('Credential tenant mismatch');
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(sealed.iv),additionalData:aad(expected)},await key(env),new Uint8Array(sealed.data));
 const props=JSON.parse(new TextDecoder().decode(plain)) as AuthProps;assertOwner(env,props);if(props.userId!==expected.userId||props.namespace!==expected.namespace)throw Error('Credential tenant mismatch');return props;
}
