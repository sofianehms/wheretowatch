import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

function refuseInside(repo, target) {
  const path = relative(repo, target);
  if (path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep))) {
    throw new Error('The report path must be outside the repository.');
  }
}

async function resolveExistingPrefix(target) {
  try {
    await lstat(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return resolve(await resolveExistingPrefix(dirname(target)), relative(dirname(target), target));
  }
  return realpath(target);
}

export async function resolveOutputPath(repo, output) {
  const target = resolve(output);
  const root = await realpath(repo);
  refuseInside(resolve(repo), target);
  refuseInside(root, target);
  const canonical = await resolveExistingPrefix(target);
  refuseInside(root, canonical);
  return canonical;
}
