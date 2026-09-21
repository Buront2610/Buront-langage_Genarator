import { loadAssets } from '../core/assets';
import { generate } from '../core/engine';
import type { GenerationRequest, GenerationResult, Analysis } from '../contracts';
import { finishSemanticVerification } from '../core/semantic';
import type { GenerationOptions } from '../core/engine';
let cachedPath = '', cachedAssets: ReturnType<typeof loadAssets>;
const stages = ['analyzing', 'planning', 'generating', 'validating', 'evaluating'];
export = function run(input: { result: GenerationResult; analyses: Record<string, Analysis> } | { request: GenerationRequest; analysis: Analysis; assetPath: string; options: GenerationOptions; control: SharedArrayBuffer }) {
  if ('result' in input) return finishSemanticVerification(input.result, input.analyses);
  if (cachedPath !== input.assetPath) { cachedAssets = loadAssets(input.assetPath); cachedPath = input.assetPath; }
  const control = new Int32Array(input.control);
  return generate(input.request, input.analysis, cachedAssets, { ...input.options, cancelled: () => Atomics.load(control, 0) === 1,
    stage: stage => Atomics.store(control, 1, stages.indexOf(stage)) });
};
