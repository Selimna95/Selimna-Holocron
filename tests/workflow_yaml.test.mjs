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
const reviewGateScript = reviewGate.jobs?.['review-gate']?.steps?.find(step => step.uses === 'actions/github-script@v7')?.with?.script || '';
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
assert.ok(deployJob.steps.some(step => step.uses === 'actions/jekyll-build-pages@v1'));
assert.ok(deployJob.steps.some(step => step.uses === 'actions/upload-pages-artifact@v3'));
assert.ok(deployJob.steps.some(step => step.uses === 'actions/deploy-pages@v4'));

const optimizerNightly = workflows.get('optimizer-nightly.yml');
assert.ok(optimizerNightly, 'A scheduled optimizer E2E workflow must exist');
assert.ok(optimizerNightly.on?.schedule?.some(item => item.cron === '17 3 * * *'));
assert.ok(optimizerNightly.on?.workflow_dispatch, 'The nightly optimizer E2E must also be manually runnable');
const nightlyStep = optimizerNightly.jobs?.['optimizer-nightly']?.steps?.find(step => step.run?.includes('tests/mod_engine_pyodide.test.mjs'));
assert.ok(nightlyStep, 'The nightly workflow must run the shared Pyodide integration test');
assert.equal(nightlyStep.env?.HOLOCRON_NIGHTLY_E2E, '1');
assert.equal(optimizerNightly.jobs?.['optimizer-nightly']?.['timeout-minutes'], 30);

console.log('GitHub Actions workflow YAML and quality-gated Pages deployment: OK');
