const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const severityRank = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

const allowlist = JSON.parse(readFileSync(join(__dirname, '..', 'security-audit.allowlist.json'), 'utf8'));
const acceptedSources = new Set(Object.keys(allowlist.acceptedAdvisories).map(Number));

const auditCommand = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
const auditArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npm audit --omit=dev --json']
  : ['audit', '--omit=dev', '--json'];
const audit = spawnSync(auditCommand, auditArgs, {
  cwd: join(__dirname, '..'),
  encoding: 'utf8',
});

if (!audit.stdout) {
  if (audit.error) {
    process.stderr.write(`${audit.error.message}\n`);
  }
  process.stderr.write(audit.stderr || 'npm audit did not return a JSON report.\n');
  process.exit(audit.status || 1);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch (error) {
  process.stderr.write(audit.stdout);
  process.stderr.write(audit.stderr || '');
  process.stderr.write(`Unable to parse npm audit JSON: ${error.message}\n`);
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities || {};

function collectSources(name, seen = new Set()) {
  if (seen.has(name)) {
    return new Set();
  }
  seen.add(name);

  const vulnerability = vulnerabilities[name];
  if (!vulnerability) {
    return new Set();
  }

  const sources = new Set();
  for (const via of vulnerability.via || []) {
    if (typeof via === 'object' && via.source) {
      sources.add(via.source);
    } else if (typeof via === 'string') {
      for (const source of collectSources(via, seen)) {
        sources.add(source);
      }
    }
  }
  return sources;
}

const failing = [];
const accepted = [];

for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  if (severityRank[vulnerability.severity] < severityRank.high) {
    continue;
  }

  const sources = collectSources(name);
  const sourceList = [...sources];
  const isAccepted = sourceList.length > 0 && sourceList.every((source) => acceptedSources.has(source));

  if (isAccepted) {
    accepted.push({ name, severity: vulnerability.severity, sources: sourceList });
  } else {
    failing.push({ name, severity: vulnerability.severity, sources: sourceList });
  }
}

if (accepted.length > 0) {
  console.log('Accepted temporary mobile audit advisories:');
  for (const item of accepted) {
    console.log(`- ${item.name} (${item.severity}) via ${item.sources.join(', ')}`);
  }
}

if (failing.length > 0) {
  console.error('Blocking mobile audit vulnerabilities:');
  for (const item of failing) {
    console.error(`- ${item.name} (${item.severity}) via ${item.sources.join(', ') || 'unknown source'}`);
  }
  process.exit(1);
}

console.log('No blocking high or critical mobile vulnerabilities.');
