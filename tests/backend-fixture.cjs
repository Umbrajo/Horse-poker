const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
let handler, now = Date.now();
let password = 'test-password';
const rows = new Map();
const metrics={clients:0,authCalls:0};
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
function createClient() {
 metrics.clients++;
  return {
    auth: { getUser: async token => {metrics.authCalls++;return { data: { user: token === 'bad' ? null : { id: token } } };} },
    from: () => {
      let code, version, patch;
      const q = {
        insert: async row => { rows.set(row.code, { version: 0, ...structuredClone(row) }); return {}; },
        select: () => q,
        eq: (key, value) => { if (key === 'code') code = value; else version = value; return q; },
        single: async () => ({ data: structuredClone(rows.get(code)) }),
        update: value => { patch = value; return q; },
        maybeSingle: async () => {
          const row = rows.get(code);
          if (row.version !== version) return { data: null };
          Object.assign(row, structuredClone(patch)); return { data: { version: row.version } };
        }
      }; return q;
    }
  };
}
const context = vm.createContext({ console, Response, Request, crypto, TextEncoder, TextDecoder, Date: Clock, Uint32Array, Uint8Array, createClient,
  Deno: { env: { get: key => key === 'SITE_PASSWORD' ? password : '' }, serve: h => { handler = h; } } });
vm.runInContext(fs.readFileSync('supabase/functions/poker/engine.js', 'utf8').replace('export { Poker };', ''), context);
vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/poker/index.ts', 'utf8')).replace(/^import .*$/gm, '').replace('export function view', 'function view'), context);
async function call(id, body) {
  const response = await handler(new Request('https://local', { method: 'POST', headers: { Authorization: 'Bearer ' + id, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'test-password', ...body }) }));
  return { status: response.status, body: await response.json() };
}
async function ok(id, body) { const r = await call(id, body); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; }

module.exports={call,ok,rows,metrics,time:()=>now,setTime:value=>{now=value},advance:ms=>{now+=ms},setPassword:value=>{password=value}};
