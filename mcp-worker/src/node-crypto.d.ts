// Workers runs node:crypto under the existing nodejs_compat flag; no extra dependency.
declare module 'node:crypto' {
 export function createHash(algorithm:'sha256'):{update(data:string):{digest(encoding:'hex'):string}};
}
