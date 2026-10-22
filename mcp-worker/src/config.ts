import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
export interface Env {
  MONITOR_ENCRYPTION_KEY?: string;
  LOCAL_CREDENTIALS?: Fetcher;
  PUBLIC_ORIGIN: string;
  MEMORY_NAMESPACE: string;
  MEMORY_READ_NAMESPACES?: string;
  OWNER_SUPERMEMORY_ID: string;
  SUPERMEMORY_CLIENT_ID: string;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  LEARNERS: DurableObjectNamespace;
  LEETCODE_USERNAME: string;
  CODEFORCES_HANDLE: string;
  GITHUB_SOLUTIONS_REPO?: string;
  GITHUB_SOLUTIONS_PATH?: string;
}
export type AuthProps = { userId: string; namespace: string; accessToken: string; refreshToken?: string; expiresAt: number };
export const UPSTREAM = {
  issuer: 'https://api.supermemory.ai/api/auth',
  authorize: 'https://api.supermemory.ai/api/auth/oauth2/authorize',
  token: 'https://api.supermemory.ai/api/auth/oauth2/token',
  register: 'https://api.supermemory.ai/api/auth/oauth2/register',
  mcp: 'https://mcp.supermemory.ai/mcp',
} as const;
export const SCOPES = ['learning:read', 'learning:write', 'offline_access'];
export function readNamespaces(env:Env) {
  const requested=(env.MEMORY_READ_NAMESPACES??env.MEMORY_NAMESPACE).split(',').map(s=>s.trim());
  if(requested.length>8||requested.some(s=>!/^[-A-Za-z0-9_]{1,80}$/.test(s)))throw Error('Invalid configured memory read spaces');
  return [...new Set([env.MEMORY_NAMESPACE,...requested])];
}
export function origin(env: Env) {
  const u = new URL(env.PUBLIC_ORIGIN);
  if (u.origin !== env.PUBLIC_ORIGIN || u.username || u.password ||
    (u.protocol !== 'https:' && !(u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname)))) throw Error('Invalid public origin');
  return u.origin;
}
export function assertOwner(env: Env, props: AuthProps) {
  if (!env.OWNER_SUPERMEMORY_ID || props.userId !== env.OWNER_SUPERMEMORY_ID || props.namespace !== env.MEMORY_NAMESPACE || env.MEMORY_NAMESPACE !== 'leetcode_problems') throw Error('Account or space is not authorized');
}
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export async function sha256(s: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export async function fetchTimed(url: string, init: RequestInit = {}, timeout = 12000) {
  const response=await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
  if(response.status>=300&&response.status<400)throw Error('Unexpected upstream redirect');
  return response;
}
