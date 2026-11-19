import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';

const workflowDir = new URL('../.github/workflows/', import.meta.url);
const files = fs.readdirSync(workflowDir).filter(name => /\.ya?ml$/i.test(name));
assert.ok(files.length > 0, 'At least one GitHub Actions workflow must exist');

const workflows = new Map();
for (const name of files) {
  const source = fs.readFileSync(new URL(name, workflowDir), 'utf8');
  const document = YAML.parseDocument(source, { uniqueKeys: true });
  assert.equal(document.errors.length, 0, name + ' must be valid YAML: ' + document.errors.map(error => error.message).join('; '));
  workflows.set(name, document.toJS());
}

const quality = workflows.get('quality.yml');
const reviewGate = workflows.get('review-gate.yml');
assert.ok(reviewGate, 'A tool-review gate workflow must exist');
assert.equal(reviewGate.on.pull_request, undefined, 'The review gate must not fail before a review can exist');
assert.deepEqual(reviewGate.on.pull_request_review.types, ['submitted', 'edited', 'dismissed']);
const reviewGateScript = reviewGate.jobs?.['review-gate']?.steps?.find(step => step.uses === 'actions/github-script@f28e40c7f34bde8b3046d885e986cb6290c5673b')?.with?.script || '';
assert.match(reviewGateScript, /Relecture automatisée du diff complet effectuée\./);
assert.match(reviewGateScript, /review\.commit_id\s*===\s*pr\.head\.sha/);
const deploy = workflows.get('deploy-pages-after-quality.yml');
assert.ok(quality, 'Quality workflow must exist');
assert.ok(deploy, 'Quality-gated Pages workflow must exist');
assert.equal(quality.name, 'Quality checks');
assert.ok(deploy.on?.workflow_run, 'Pages deployment must wait for a workflow_run');
assert.deepEqual(deploy.on.workflow_run.workflows, [quality.name]);
assert.deepEqual(deploy.on.workflow_run.branches, ['main']);
assert.deepEqual(deploy.on.workflow_run.types, ['completed']);

const deployJob = deploy.jobs?.deploy;
assert.ok(deployJob, 'A deploy job must exist');
assert.match(deployJob.if, /conclusion\s*==\s*'success'/);
assert.match(deployJob.if, /event\s*==\s*'push'/);
assert.match(deployJob.if, /head_branch\s*==\s*'main'/);
assert.match(deployJob.if, /head_repository\.full_name\s*==\s*github\.repository/);
assert.ok(deployJob.steps.some(step => step.uses === 'actions/jekyll-build-pages@44a6e6beabd48582f863aeeb6cb2151cc1716697'));
assert.ok(deployJob.steps.some(step => step.uses === 'actions/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa'));
assert.ok(deployJob.steps.some(step => step.uses === 'actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e'));
assert.ok(deployJob.steps.some(step => step.uses === 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262'));

const optimizerNightly = workflows.get('optimizer-nightly.yml');
assert.ok(optimizerNightly, 'A scheduled optimizer E2E workflow must exist');
assert.ok(optimizerNightly.on?.schedule?.some(item => item.cron === '17 3 * * *'));
assert.deepEqual(optimizerNightly.on?.push?.branches, ['test/nightly-e2e-g12-1200']);
assert.ok(Object.hasOwn(optimizerNightly.on || {}, 'workflow_dispatch'), 'The nightly optimizer E2E must also be manually runnable');
const nightlyStep = optimizerNightly.jobs?.['optimizer-nightly']?.steps?.find(step => step.run?.includes('tests/mod_engine_pyodide.test.mjs'));
assert.ok(nightlyStep, 'The nightly workflow must run the shared Pyodide integration test');
assert.equal(nightlyStep.env?.HOLOCRON_NIGHTLY_E2E, '1');
assert.equal(optimizerNightly.jobs?.['optimizer-nightly']?.['timeout-minutes'], 30);


assert.equal(quality.permissions?.contents, 'read', 'Quality checks must have read-only repository permissions');
assert.equal(optimizerNightly.permissions?.contents, 'read', 'Optimizer benchmark must have read-only repository permissions');
for (const name of ['refresh-gac-catalog.yml', 'refresh-gac-official.yml', 'refresh-gac-defense-catalog.yml']) {
  const workflow = workflows.get(name);
  assert.equal(workflow.permissions?.contents, 'read', name + ' must default to read-only repository permissions');
  const jobs = Object.values(workflow.jobs || {});
  assert.equal(jobs.length, 2, name + ' must separate collection and publication jobs');
  const collection = jobs.find(job => job.permissions?.contents === 'read');
  const publication = jobs.find(job => job.permissions?.contents === 'write');
  assert.ok(collection, name + ' collection job must be read-only');
  assert.ok(publication, name + ' publication job must have the only write permission');
  assert.equal(collection.if, "github.ref == 'refs/heads/main'", name + ' collection must refuse non-main refs');
  assert.equal(publication.if, "github.ref == 'refs/heads/main'", name + ' publication must refuse non-main refs');
  assert.ok(publication.needs, name + ' publication must wait for collection');
  const collectUses = collection.steps.map(step => step.uses || '');
  const publishUses = publication.steps.map(step => step.uses || '');
  assert.ok(collectUses.some(use => use.startsWith('actions/upload-artifact@')), name + ' collection must upload generated data');
  assert.ok(publishUses.some(use => use.startsWith('actions/download-artifact@')), name + ' publication must download generated data');
  const collectionCheckout = collection.steps.find(step => step.uses?.startsWith('actions/checkout@'));
  assert.equal(collectionCheckout?.with?.persist-credentials, false, name + ' collection checkout must not persist a token');
}
for (const name of files) {
  const source = fs.readFileSync(new URL(name, workflowDir), 'utf8');
  assert.doesNotMatch(source, /uses:\s*[^\s@]+@v\d+\b/, name + ' must pin external actions to immutable commit SHAs');
}

console.log('GitHub Actions workflow YAML and quality-gated Pages deployment: OK');
