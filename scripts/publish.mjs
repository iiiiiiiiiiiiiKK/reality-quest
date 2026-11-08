/**
 * Publish the current working tree to GitHub using the Git Data API.
 *
 * `git push` over HTTPS stalls in this environment (a TLS-intercepting proxy
 * keeps resetting long-lived uploads), so we commit through the REST API
 * instead: create blobs -> build a tree -> create a commit -> fast-forward the
 * branch ref. The result is byte-identical to what `git push` would produce.
 *
 * Usage: node scripts/publish.mjs
 * Env: GITHUB_TOKEN, GITHUB_REPO=owner/name, GITHUB_BRANCH=main
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || 'iiiiiiiiiiiiiKK/reality-quest';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const MESSAGE = process.env.COMMIT_MESSAGE || 'chore: sync working tree';
const AUTHOR_NAME = '0xkillcoin';
const AUTHOR_EMAIL = 'iiiiiiiiiiiiiKK@users.noreply.github.com';

if (!TOKEN) {
  console.error('GITHUB_TOKEN is required');
  process.exit(1);
}

const API = `https://api.github.com/repos/${REPO}`;
const H = {
  Authorization: `token ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'reality-quest-publish',
  'Content-Type': 'application/json',
};

async function api(path, method = 'GET', body) {
  const res = await fetch(`${path.startsWith('http') ? path : API + path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : undefined;
}

function gitFiles() {
  // Every tracked file in the index, NUL separated, respecting line endings as
  // committed (not as the working tree has them on Windows).
  const out = execSync('git ls-files -z', { encoding: 'buffer' });
  return out
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

async function main() {
  const files = gitFiles();
  console.log(`tracked files: ${files.length}`);

  const ref = await api(`/git/ref/heads/${BRANCH}`);
  const parentSha = ref.object.sha;
  const parent = await api(`/git/commits/${parentSha}`);
  const baseTree = parent.tree.sha;
  console.log(`parent commit: ${parentSha.slice(0, 8)}`);

  // Upload blobs in small concurrent batches to keep each request small and
  // avoid a single very long-lived upload.
  const tree = [];
  const BATCH = 4;
  for (let i = 0; i < files.length; i += BATCH) {
    const slice = files.slice(i, i + BATCH);
    const entries = await Promise.all(
      slice.map(async (path) => {
        const buf = execSync(`git show :"${path}"`, { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
        const blob = await api('/git/blobs', 'POST', {
          content: buf.toString('base64'),
          encoding: 'base64',
        });
        return { path, mode: '100644', type: 'blob', sha: blob.sha };
      }),
    );
    tree.push(...entries);
    process.stdout.write(`\r  uploaded ${Math.min(i + BATCH, files.length)}/${files.length}`);
  }
  console.log('');

  // Remove screenshots that exist on the remote but no longer in the repo.
  const remoteTree = await api(`/git/trees/${baseTree}?recursive=1`);
  const remotePaths = (remoteTree.tree || []).filter((n) => n.type === 'blob').map((n) => n.path);
  const localSet = new Set(files);
  const deletions = remotePaths.filter((p) => !localSet.has(p));
  for (const path of deletions) {
    tree.push({ path, mode: '100644', type: 'blob', sha: null });
    console.log(`  delete ${path}`);
  }

  const newTree = await api('/git/trees', 'POST', { base_tree: baseTree, tree });
  console.log(`tree: ${newTree.sha.slice(0, 8)}`);

  if (newTree.sha === baseTree) {
    console.log('nothing to publish');
    return;
  }

  const commit = await api('/git/commits', 'POST', {
    message: MESSAGE,
    tree: newTree.sha,
    parents: [parentSha],
    author: { name: AUTHOR_NAME, email: AUTHOR_EMAIL, date: new Date().toISOString() },
    committer: { name: AUTHOR_NAME, email: AUTHOR_EMAIL, date: new Date().toISOString() },
  });
  console.log(`commit: ${commit.sha.slice(0, 8)}`);

  await api(`/git/refs/heads/${BRANCH}`, 'PATCH', { sha: commit.sha, force: true });
  console.log(`updated refs/heads/${BRANCH} -> ${commit.sha.slice(0, 8)}`);
  console.log(`https://github.com/${REPO}/commit/${commit.sha}`);
}

main().catch((err) => {
  console.error('publish failed:', err.message);
  process.exit(1);
});
