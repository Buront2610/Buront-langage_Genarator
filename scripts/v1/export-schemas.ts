import fs from 'node:fs';
import { GenerationSchema, PreferenceSchema, RegenerationSchema, AnalysisSchema } from '../../packages/contracts';
import * as resultSchemas from '../../packages/contracts/results';
fs.mkdirSync('packages/contracts/generated', { recursive: true });
for (const [name, schema] of Object.entries({ generation: GenerationSchema, preference: PreferenceSchema, regeneration: RegenerationSchema, analysis: AnalysisSchema })) fs.writeFileSync(`packages/contracts/generated/${name}.schema.json`, JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...schema }, null, 2) + '\n');
for (const [name, schema] of Object.entries(resultSchemas)) fs.writeFileSync(`packages/contracts/generated/${name}.schema.json`, JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...schema }, null, 2) + '\n');
