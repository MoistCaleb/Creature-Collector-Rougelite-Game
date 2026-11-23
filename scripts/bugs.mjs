/**
 * Bug reports sent from Settings › Report a bug (table: bug_reports, see supabase/bug-reports.sql).
 *
 *   node scripts/bugs.mjs            list every report, oldest first
 *   node scripts/bugs.mjs delete 3 7 delete reports 3 and 7 (once fixed and logged)
 *
 * Reading and deleting need the private bug-report key in the x-bug-token header. In Claude Code
 * cloud sessions it's a saved network credential, added to every request to the Supabase host by
 * the proxy, so nothing is set here. Elsewhere, set BUG_TOKEN.
 */
import { readFileSync } from 'node:fs';

const cfg = readFileSync(new URL('../src/net/accountConfig.ts', import.meta.url), 'utf8');
const url = cfg.match(/SUPABASE_URL = '([^']+)'/)[1];
const key = cfg.match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
if (process.env.BUG_TOKEN) headers['x-bug-token'] = process.env.BUG_TOKEN;
const api = `${url}/rest/v1/bug_reports`;

const [cmd, ...ids] = process.argv.slice(2);
if (cmd === 'delete') {
  const nums = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!nums.length) throw new Error('usage: node scripts/bugs.mjs delete <id> [id…]');
  const res = await fetch(`${api}?id=in.(${nums.join(',')})`, { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const gone = await res.json();
  console.log(gone.length ? `Deleted ${gone.map((r) => `#${r.id}`).join(', ')}` : 'Nothing deleted (wrong ids, or the bug-report key is missing).');
} else {
  const res = await fetch(`${api}?select=*&order=id.asc`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const rows = await res.json();
  if (!rows.length) console.log('No bug reports (or the bug-report key is missing: without it the list always looks empty).');
  for (const r of rows) {
    console.log(`#${r.id} · ${r.place} · ${r.created_at.slice(0, 16).replace('T', ' ')}${r.username ? ` · ${r.username}` : ''}`);
    console.log(`  ${r.description.replace(/\n/g, '\n  ')}`);
    console.log(`  context: ${JSON.stringify(r.context)}\n`);
  }
}
