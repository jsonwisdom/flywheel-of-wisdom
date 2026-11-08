import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** CI-FIRST: exact immutable GitHub Action commits, not mutable tags. */
export function auditUses(text) {
  const lines = text.split(/\r?\n/);
  const checks = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/);
    if (!match) continue;
    const ref = match[1];
    const localAction = ref.startsWith('./');
    const commitPinned = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.\/-]+@[a-fA-F0-9]{40}$/.test(ref);
    checks.push({ line: i + 1, ref, status: localAction || commitPinned ? 'PASS' : 'FAIL' });
  }
  return { schema: 'CW_ACTION_PIN_AUDIT_V1', checked: checks.length,
    passed: checks.filter(x => x.status === 'PASS').length,
    failed: checks.filter(x => x.status === 'FAIL').length, checks };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = process.argv.slice(2);
  if (!paths.length) { console.error('FAIL: provide workflow path(s)'); process.exitCode = 2; }
  else for (const file of paths) {
    const result = auditUses(readFileSync(file, 'utf8'));
    console.log(JSON.stringify({ file, ...result }));
    if (!result.checked || result.failed) process.exitCode = 1;
  }
}
