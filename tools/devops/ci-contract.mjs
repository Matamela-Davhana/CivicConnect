import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const requirements = {
  frontend: { folder: 'source/frontend', scripts: ['lint', 'build'] },
  backend: { folder: 'source/backend', scripts: ['lint', 'start', 'test:unit', 'test:integration', 'test:e2e'] },
  browser: { folder: 'source/frontend', scripts: ['preview', 'test:e2e:install', 'test:e2e'] }
};
const placeholder = /no test specified|--passWithNoTests|--if-present|\|\|\s*(?:true|exit\s+0)|^\s*(?:echo\b|true\s*$|exit\s+0\s*$)/i;
const hasTests = (directory) => {
  if (!existsSync(directory)) return false;
  return readdirSync(directory, { withFileTypes: true }).some((item) => {
    if (item.isSymbolicLink() || ['node_modules', 'artifacts', 'coverage'].includes(item.name)) return false;
    const file = path.join(directory, item.name);
    return item.isDirectory() ? hasTests(file) : /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(item.name);
  });
};

export function checkContract(root, component) {
  const config = requirements[component];
  if (!config) throw new Error('Component must be frontend, backend or browser');
  const problems = [];
  const directory = path.join(root, config.folder);
  let manifest;
  try { manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')); }
  catch { return [`${config.folder}/package.json is missing or invalid JSON`]; }
  if (!existsSync(path.join(directory, 'package-lock.json'))) problems.push(`${config.folder}/package-lock.json is required for npm ci`);
  for (const name of config.scripts) {
    const command = manifest.scripts?.[name];
    if (typeof command !== 'string' || !command.trim()) problems.push(`${config.folder}: missing npm script "${name}"`);
    else if (placeholder.test(command)) problems.push(`${config.folder}: "${name}" uses a placeholder or masks missing/failed checks`);
  }
  const testFolders = component === 'backend'
    ? [['tests/unit'], ['tests/integration', 'tests/api'], ['tests/e2e']]
    : component === 'browser' ? [['tests/e2e', 'e2e']] : [];
  for (const choices of testFolders) {
    if (!choices.some((name) => hasTests(path.join(directory, name)))) problems.push(`${config.folder}: add real .test/.spec files under ${choices.join(' or ')}`);
  }
  if (component === 'backend' && !existsSync(path.join(directory, 'migrations/001_initial_schema.sql'))) problems.push('Missing agreed initial migration; update the CI migration step with the backend owner');
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const component = process.argv[2];
    const problems = checkContract(process.cwd(), component);
    if (problems.length) {
      console.error(`NOT READY: ${component}\n${problems.map((p) => `- ${p}`).join('\n')}`);
      process.exitCode = 1;
    } else console.log(`Contract present: ${component}. The build and tests must still execute successfully.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
