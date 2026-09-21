import { compileAssets, publishAssets } from '../../packages/core/assets';
const assets = compileAssets(); console.log(JSON.stringify({ datasetId: assets.datasetId, path: publishAssets(assets), evidence: assets.evidence.length, lexicon: assets.lexicon.length, rights: assets.manifest.rights }));
