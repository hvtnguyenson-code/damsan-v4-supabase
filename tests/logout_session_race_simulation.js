'use strict';

const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('giaovien.js', 'utf8');

function functionBody(name) {
  const start = source.indexOf('function ' + name + '(');
  const asyncStart = source.indexOf('async function ' + name + '(');
  const fnStart = start >= 0 ? start : asyncStart;
  assert(fnStart >= 0, 'missing function ' + name);

  const brace = source.indexOf('{', fnStart);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(fnStart, i + 1);
    }
  }
  throw new Error('unterminated function ' + name);
}

assert(source.includes('let gvLogoutInProgress = false;'), 'logout latch missing');
assert(source.includes('function stopGvBackgroundWorkForLogout()'), 'background shutdown helper missing');

const expiryHandler = functionBody('clearGvSessionAndReturnToLogin');
assert(
  expiryHandler.indexOf('if (gvLogoutInProgress) return;') <
  expiryHandler.indexOf('alert(message)'),
  'intentional logout must suppress expiry alert'
);

const ensure = functionBody('ensureControlSession');
assert(
  ensure.includes("if (gvLogoutInProgress) throw new Error('logout_in_progress');"),
  'missing-token path must be silent during logout'
);

const logout = functionBody('dangXuatGV');
const latch = logout.indexOf('gvLogoutInProgress = true');
const stop = logout.indexOf('stopGvBackgroundWorkForLogout()');
const localClear = logout.indexOf('clearControlSessions()');
const remoteStaff = logout.indexOf("sb.rpc('rpc_staff_logout'");
const remoteAdmin = logout.indexOf("sb.rpc('rpc_admin_logout'");
const remoteWait = logout.indexOf('await Promise.allSettled(requests)');

assert(latch >= 0, 'logout latch is not set');
assert(stop > latch, 'background work must stop after logout latch');
assert(localClear > stop, 'local session must clear after background work stops');
assert(remoteStaff > localClear, 'staff revoke must use captured token after local cleanup');
assert(remoteAdmin > localClear, 'admin revoke must use captured token after local cleanup');
assert(remoteWait > remoteStaff && remoteWait > remoteAdmin, 'remote revokes must be best-effort awaited');
assert(
  /finally\s*\{[\s\S]*clearControlSessions\(\);[\s\S]*location\.reload\(\);/.test(logout),
  'logout must always finish with idempotent cleanup and reload'
);

const guardedAdmin = (source.match(/data\?\.code === 'admin_session_invalid'[\s\S]{0,180}gvLogoutInProgress/g) || []).length;
const guardedStaff = (source.match(/data\?\.code === 'staff_session_invalid'[\s\S]{0,180}gvLogoutInProgress/g) || []).length;
assert(guardedAdmin >= 2, 'admin invalid-session handlers must be guarded during logout');
assert(guardedStaff >= 1, 'staff invalid-session handler must be guarded during logout');

console.log('PASS logout session race regression');
