import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export function resolveGoogleServiceAccountPath(adapterUrl) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }

  const workspacePath = process.env.MC_WORKSPACE
    ? path.join(process.env.MC_WORKSPACE, '.secrets', 'google-service-account.json')
    : null;
  if (workspacePath && existsSync(workspacePath)) return workspacePath;

  const adapterDir = path.dirname(fileURLToPath(adapterUrl));
  return path.resolve(adapterDir, '..', '..', '..', '..', '.secrets', 'google-service-account.json');
}
