const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const script = readFileSync(join(__dirname, 'security-audit.js'), 'utf8');
const exception = { package: 'braces', reviewBefore: '2026-10-17' };

function runAudit({ vulnerabilities = {}, acceptedAdvisories = { 1240992: exception }, result = {} } = {}) {
  const output = [];
  const exited = Symbol('exited');
  let code = 0;
  const write = (message) => output.push(message);
  const audit = {
    status: Object.keys(vulnerabilities).length ? 1 : 0,
    stdout: JSON.stringify({ auditReportVersion: 2, vulnerabilities }),
    stderr: '',
    ...result,
  };
  try {
    runInNewContext(script, {
      __dirname,
      require(name) {
        if (name === 'node:child_process') return { spawnSync: () => audit };
        if (name === 'node:fs') return { readFileSync: () => JSON.stringify({ acceptedAdvisories }) };
        if (name === 'node:path') return require(name);
        throw new Error(`Unexpected module: ${name}`);
      },
      Date: class extends Date {
        constructor() { super('2026-10-03T12:00:00Z'); }
      },
      console: { log: write, error: write },
      process: {
        platform: 'linux', env: {}, stdout: { write }, stderr: { write },
        exit(status) { code = status; throw exited; },
      },
    });
  } catch (error) {
    if (error !== exited) throw error;
  }
  return { code, output: output.join('\n') };
}

const knownVulnerabilities = {
  expo: { severity: 'high', via: ['metro'] },
  metro: { severity: 'high', via: ['expo', 'braces'] },
  braces: { severity: 'high', via: [{ source: 1240992 }] },
};

test('accepts a clean audit', () => {
  assert.equal(runAudit().code, 0);
});

test('accepts an unexpired advisory through transitive and cyclic dependencies', () => {
  const result = runAudit({ vulnerabilities: knownVulnerabilities });
  assert.equal(result.code, 0);
  assert.match(result.output, /Accepted temporary mobile audit advisories/);
});

test('blocks a new advisory even when the dependency also has an accepted advisory', () => {
  const result = runAudit({ vulnerabilities: {
    ...knownVulnerabilities,
    braces: { severity: 'high', via: [{ source: 1240992 }, { source: 9999999 }] },
  } });
  assert.equal(result.code, 1);
  assert.match(result.output, /Blocking mobile audit vulnerabilities/);
});

test('blocks high and critical vulnerabilities with no identifiable source', () => {
  for (const severity of ['high', 'critical']) {
    assert.equal(runAudit({ vulnerabilities: { unknown: { severity, via: [] } } }).code, 1);
  }
});

test('blocks exceptions on or after their review date and without a valid date', () => {
  for (const reviewBefore of ['2026-10-02', '2026-10-03', undefined, 'invalid']) {
    const result = runAudit({
      vulnerabilities: knownVulnerabilities,
      acceptedAdvisories: { 1240992: { ...exception, reviewBefore } },
    });
    assert.equal(result.code, 1);
    assert.match(result.output, /needs review/);
  }
});

test('keeps moderate advisories below the blocking threshold', () => {
  assert.equal(runAudit({ vulnerabilities: {
    dependency: { severity: 'moderate', via: [{ source: 9999999 }] },
  } }).code, 0);
});

test('fails closed on registry errors, malformed reports and process failures', () => {
  for (const result of [
    { status: 1, stdout: JSON.stringify({ error: { summary: 'Registry unavailable' } }) },
    { stdout: '{}' },
    { stdout: 'null' },
    { stdout: '{' },
    { stdout: '' },
    { stdout: JSON.stringify({ auditReportVersion: 2, vulnerabilities: [] }) },
    { status: 2 },
    { status: null, error: new Error('spawn failed') },
  ]) {
    assert.equal(runAudit({ result }).code, 1);
  }
});
