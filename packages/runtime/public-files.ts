import fs from 'node:fs';
import path from 'node:path';
export function publicFile(root: string, relative: string) {
  if (!/^(index\.html|assets\/[A-Za-z0-9_.-]+\.(?:js|css|svg))$/u.test(relative)) return undefined;
  try { const actualRoot = fs.realpathSync(root), actual = fs.realpathSync(path.join(root, relative)); return actual.startsWith(actualRoot + path.sep) && fs.statSync(actual).isFile() ? actual : undefined; }
  catch { return undefined; }
}
