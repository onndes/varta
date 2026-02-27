import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

const packageJsonPath = resolve(root, 'package.json');
const tauriConfigPath = resolve(root, 'src-tauri/tauri.conf.json');
const cargoTomlPath = resolve(root, 'src-tauri/Cargo.toml');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = String(packageJson.version || '').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `Invalid package.json version "${version}". Use numeric semver like 1.0.0 for Tauri/MSI compatibility.`
  );
  process.exit(1);
}

const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
if (tauriConfig.version !== version) {
  tauriConfig.version = version;
  writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`, 'utf8');
}

const cargoToml = readFileSync(cargoTomlPath, 'utf8');
const nextCargoToml = cargoToml.replace(
  /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/,
  `$1${version}$2`
);
if (nextCargoToml !== cargoToml) {
  writeFileSync(cargoTomlPath, nextCargoToml, 'utf8');
}

console.log(`Version synced to ${version}`);
