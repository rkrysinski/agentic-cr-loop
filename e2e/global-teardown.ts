import { execSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

export default async function globalTeardown() {
  execSync('bash scripts/qa/cleanup.sh', { cwd: ROOT, stdio: 'inherit' });
}
