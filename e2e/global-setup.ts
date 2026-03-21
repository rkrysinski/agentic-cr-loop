import { execSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

function run(cmd: string) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

export default async function globalSetup() {
  // Ensure port 5173 is free before starting the dev server
  try {
    execSync('lsof -ti:5173 | xargs kill -9', { stdio: 'pipe' });
  } catch {
    // no process on 5173, that's fine
  }

  run('bash scripts/qa/setup-single-repo.sh');
  run('bash scripts/qa/start-server.sh single');
  run('bash scripts/qa/wait-for-server.sh');
}
