import fs from 'node:fs';
import { compileAssets } from '../../packages/core/assets';
import { PythonClient } from '../../packages/runtime/python-client';
import { generate } from '../../packages/core/engine';
import { validateRequest } from '../../packages/contracts';
import { verifyGeneratedResult } from '../../packages/runtime/semantic-verification';
async function main() {
  const filename = process.argv[2];
  if (!filename) throw new Error('Usage: npm run generate -- request.json');
  const request = JSON.parse(fs.readFileSync(filename, 'utf8')); validateRequest(request);
  const python = new PythonClient();
  try { await python.start(); const analysis = await python.analyze(request.source); const result = generate(request, analysis, compileAssets(), { experimentalOperators: process.argv.includes('--experimental-operators') }); console.log(JSON.stringify(await verifyGeneratedResult(result, python, analysis), null, 2)); }
  finally { python.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
