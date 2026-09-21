import fs from 'node:fs';
import { compileAssets } from '../../packages/core/assets';
import { PythonClient } from '../../packages/runtime/python-client';
import { replayGeneration } from '../../packages/core/replay';
import { verifyGeneratedResult } from '../../packages/runtime/semantic-verification';
import { hash } from '../../packages/core/source';
async function main() {
  if (fs.statSync(process.argv[2]).size > 64 * 1024 * 1024) throw new Error('REPLAY_CAPACITY_EXCEEDED');
  const saved = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), manifest = saved.replayManifest ?? saved, assets = compileAssets();
  const python = new PythonClient();
  try {
    await python.start(); const analysis = await python.analyze(manifest.request.source);
    const result = replayGeneration(manifest, analysis, assets);
    if (manifest.semanticVerification) {
      await verifyGeneratedResult(result, python, analysis);
      if (hash(result.replayManifest.semanticVerification) !== hash(manifest.semanticVerification)) throw new Error('REPLAY_SEMANTIC_MISMATCH');
    }
    console.log(JSON.stringify({ verified: true, candidateSetHash: result.replayManifest.candidateSetHash, selectedCandidateId: result.selectedCandidateId }));
  } finally { python.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
