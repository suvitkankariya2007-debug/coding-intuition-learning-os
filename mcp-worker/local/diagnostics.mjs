// Only fixed, allowlisted messages may reach the terminal or browser.
// Provider responses, callback URLs and arbitrary exception text can contain credentials.
const messages = new Map([
  ['Invalid or expired login state. Start again.', ['LOGIN_STATE', 'The login attempt expired or was replaced. Start again from http://127.0.0.1:8788.']],
  ['Supermemory authorization was cancelled or invalid.', ['LOGIN_CALLBACK', 'Supermemory cancelled authorization or returned an invalid callback. Start a fresh sign-in.']],
  ['Supermemory callback issuer is missing or unexpected.', ['LOGIN_ISSUER', 'The callback issuer is missing or unexpected. Provider compatibility needs checking; account checks remain enabled.']],
  ['Wrong Supermemory account. No tokens saved.', ['LOGIN_ACCOUNT', 'The browser signed in to a different Supermemory account. Select the configured owner account.']],
  ['Missing leetcode_problems space. No tokens saved.', ['LOGIN_SPACE', 'The signed-in account does not expose the leetcode_problems space.']],
  ['Run npm run memory:login with the intended owner.', ['LOGIN_REQUIRED', 'Run npm run memory:login with the configured owner ID.']],
  ['Supermemory sign-in required.', ['LOGIN_REQUIRED', 'Supermemory credentials need a fresh browser sign-in.']],
  ['Saved credentials belong to a different owner. Use the intended owner.', ['SAVED_OWNER', 'Saved local credentials belong to another owner. Check the configured owner ID.']],
  ['Credential directory must be private with mode 0700.', ['CREDENTIAL_PERMISSIONS', 'The local credential directory must have permissions 0700.']],
  ['Credential file must be private with mode 0600.', ['CREDENTIAL_PERMISSIONS', 'The local credential file must have permissions 0600.']],
  ['Invalid Supermemory token response.', ['TOKEN_FORMAT', 'Supermemory returned an unsupported token response.']],
  ['Provider did not issue a public PKCE registration.', ['CLIENT_REGISTRATION', 'Supermemory did not issue the required public PKCE client registration.']],
  ['Supermemory identity check failed.', ['IDENTITY_CHECK', 'The token exchange completed, but the Supermemory MCP account/space check failed.']],
]);
export function safeDiagnostic(error) {
  const known = messages.get(error?.message);
  if (known) return known[0]+': '+known[1];
  if (/^SUPERMEMORY_(REGISTER|TOKEN)_HTTP_[1-5][0-9]{2}$/.test(error?.diagnosticCode ?? '')) return error.diagnosticCode+': Supermemory rejected the OAuth request. No response body or tokens are displayed.';
  if (error?.diagnosticCode === 'SUPERMEMORY_NETWORK') return 'SUPERMEMORY_NETWORK: The OAuth request timed out or could not reach Supermemory.';
  if (error?.code === 'EADDRINUSE') return 'PORT_IN_USE: Another process is listening on the required local port.';
  if (error?.code === 'ENOENT') return 'LOCAL_FILE_MISSING: A required local file is missing. Run npm run build:tunnel and check local sign-in.';
  return 'LOCAL_STARTUP_UNKNOWN: The local operation failed. No raw error, URL or credentials are displayed.';
}
