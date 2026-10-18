import { appendFileSync } from 'node:fs';
const { TESTED_SHA, PR_HEAD_SHA, RUN_ID, GITHUB_STEP_SUMMARY } = process.env;
if (!/^[a-f0-9]{40}$/.test(TESTED_SHA || '') || !/^\d+$/.test(RUN_ID || '') || !GITHUB_STEP_SUMMARY) throw new Error('Missing validated workflow identity');
const head = /^[a-f0-9]{40}$/.test(PR_HEAD_SHA || '') ? PR_HEAD_SHA : 'not a pull request run';
appendFileSync(GITHUB_STEP_SUMMARY, `## Restart CI identity\n\n- Tested checkout SHA: \`${TESTED_SHA}\`\n- Pull-request head SHA: \`${head}\`\n- Workflow run: ${RUN_ID}\n\nFor pull requests, the tested checkout may be GitHub's temporary merge commit, not the author's branch head. This CI identity is not a deployed release-candidate tag.\n`);
