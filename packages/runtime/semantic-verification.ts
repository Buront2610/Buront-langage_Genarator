import type { Analysis, GenerationResult } from '../contracts';
import type { PythonClient } from './python-client';
import { finishSemanticVerification, semanticTexts } from '../core/semantic';
import { hash } from '../core/source';

export async function semanticAnalyses(result: GenerationResult, python: PythonClient, original: Analysis, deadline = Date.now() + 30000, signal?: AbortSignal) {
  const analyses: Record<string, Analysis> = {};
  for (const text of semanticTexts(result)) analyses[hash(text)] = text === result.ir.source.raw ? original : await python.analyze(text, deadline, signal);
  return analyses;
}
export async function verifyGeneratedResult(result: GenerationResult, python: PythonClient, original: Analysis) {
  return finishSemanticVerification(result, await semanticAnalyses(result, python, original));
}
