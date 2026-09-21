import fs from 'node:fs';
import path from 'node:path';
import { compileAssets, loadAssets, publishAssets } from '../../packages/core/assets';
const [command, id] = process.argv.slice(2);
const directory = path.join(process.cwd(), '.runtime/assets');
if (command === 'build') console.log(publishAssets(compileAssets()));
else if (command === 'list') console.log(JSON.stringify(fs.readdirSync(directory).filter(file => /^[a-f0-9]{64}\.json$/u.test(file)).map(file => file.slice(0, -5))));
else if (command === 'activate' || command === 'rollback') {
  if (!/^[a-f0-9]{64}$/u.test(id ?? '')) throw new Error('INVALID_DATASET_ID');
  const assets = loadAssets(path.join(directory, `${id}.json`));
  const staging = path.join(directory, 'active.json.staging'); fs.writeFileSync(staging, JSON.stringify({ schemaVersion: 1, datasetId: assets.datasetId })); fs.renameSync(staging, path.join(directory, 'active.json'));
  console.log(JSON.stringify({ active: assets.datasetId, safetyChecks: 'v1-contract-preserved', appliesTo: 'subsequent-jobs' }));
} else throw new Error('Usage: assets-command build|list|activate|rollback [datasetId]');
