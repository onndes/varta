import { execFileSync } from 'node:child_process';

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' });
}

if (process.env.SKIP_VERSION_BUMP === '1') {
  console.log('Skipping version bump because SKIP_VERSION_BUMP=1');
  process.exit(0);
}

run('npm', ['version', 'patch', '--no-git-tag-version']);
run('node', ['scripts/sync-version.mjs']);
run('git', [
  'add',
  'package.json',
  'package-lock.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
]);
