import test from 'node:test';
import assert from 'node:assert/strict';
import { auditUses } from './action-pin-check.mjs';
const sha = '11d5960a326750d5838078e36cf38b85af677262';

test('SHA40-pin trusted action accepted', () => {
  const x = auditUses('    - uses: actions/checkout@'+sha+' # v4');
  assert.equal(x.checked, 1); assert.equal(x.passed, 1); assert.equal(x.failed, 0);
});
test('floating major tag rejected', () => {
  assert.equal(auditUses('    - uses: actions/checkout@v4').failed, 1);
});
test('floating full semver rejected', () => {
  assert.equal(auditUses('uses: actions/setup-node@v4.0.4').failed, 1);
});
test('GitHub expression selector rejected', () => {
  assert.equal(auditUses('    uses: ${{ matrix.action }}').failed, 1);
});
test('local path action allowed at current commit', () => {
  assert.equal(auditUses('    uses: ./ci/local-action').passed, 1);
});
test('separate non-action YAML is not falsely matched', () => {
  assert.equal(auditUses('name: tests\n# uses: foo/bar@v1\nrun: echo uses: actions/checkout@v4').checked, 0);
});
test('mixed pass/fail cannot greenwash', () => {
  const x = auditUses('uses: actions/checkout@'+sha+'\nuses: actions/upload-artifact@v4');
  assert.equal(x.checked, 2); assert.equal(x.passed, 1); assert.equal(x.failed, 1);
});
