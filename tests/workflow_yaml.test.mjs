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
assert.ok(reviewGate, 'A PR policy gate workflow must exist');
assert.deepEqual(reviewGate.on.pull_request.types, ['opened', 'synchronize', 'reopened', 'ready_for_review']);
assert.equal(reviewGate.on.pull_request_review, undefined, 'The PR gate must not depend on a human review event');
assert.equal(reviewGate.permissions['pull-requests'], 'read');
const reviewGateScript = reviewGate.jobs?.['review-gate']?.steps?.find(step => step.uses === 'actions/github-script@v7')?.with?.script || '';
assert.match(reviewGateScript, /pr\.base\.ref\s*!==?\s*"main"|pr\.base\.ref\s*!==\s*"main"/, 'The gate must verify that the PR targets main');
assert.match(reviewGateScript, /pr\.head\.ref\s*===\s*"main"/, 'The gate must reject main as the source branch');
assert.match(reviewGateScript, /pr\.title/, 'The gate must require a PR title');
assert.match(reviewGateScript, /pr\.body/, 'The gate must require a PR description');
assert.match(reviewGateScript, /pulls\.listFiles/, 'The gate must inspect changed files');
assert.match(reviewGateScript, /space|espace final/i, 'The gate must report trailing whitespace');
assert.match(reviewGateScript, /marqueur de conflit Git ajouté/, 'The gate must reject added Git conflict markers');
assert.doesNotMatch(reviewGateScript, /APPROVED|independentApproval|approbation humaine/i, 'The gate must not require a human approval');
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
assert.deepEqual(optimizerNightly.on?.push?.branches, ['test/nightly-e2e-g12-1200']);
assert.ok(Object.hasOwn(optimizerNightly.on || {}, 'workflow_dispatch'), 'The nightly optimizer E2E must also be manually runnable');
const nightlyStep = optimizerNightly.jobs?.['optimizer-nightly']?.steps?.find(step => step.run?.includes('tests/mod_engine_pyodide.test.mjs'));
assert.ok(nightlyStep, 'The nightly workflow must run the shared Pyodide integration test');
assert.equal(nightlyStep.env?.HOLOCRON_NIGHTLY_E2E, '1');
assert.equal(optimizerNightly.jobs?.['optimizer-nightly']?.['timeout-minutes'], 30);

console.log('GitHub Actions workflow YAML and quality-gated Pages deployment: OK');
