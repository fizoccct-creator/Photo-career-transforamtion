// Lists the image models your API key can use, so you can set the model in .env.
// Uses AI_PROVIDER from .env (openai or gemini). Usage: npm run models
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));
const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();

function fail(msg) { console.error(msg); process.exit(1); }

async function openaiModels() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) fail('OPENAI_API_KEY is empty. Add it to career-transformation/.env first.');
  const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
  const json = await res.json();
  if (!res.ok) fail(`OpenAI error: ${json.error?.message || res.status}`);
  return { current: process.env.OPENAI_MODEL || 'gpt-image-2.5-sunburst', envVar: 'OPENAI_MODEL',
    ids: json.data.map((m) => m.id).filter((id) => /image/i.test(id)).sort() };
}

async function geminiModels() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) fail('GEMINI_API_KEY is empty. Add it to career-transformation/.env first.');
  const models = [];
  let pageToken = '';
  do {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`,
      { headers: { 'x-goog-api-key': key } });
    const json = await res.json();
    if (!res.ok) fail(`Gemini error: ${json.error?.message || res.status}`);
    models.push(...(json.models || []));
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return { current: process.env.GEMINI_MODEL || 'gemini-3.1-flash-image', envVar: 'GEMINI_MODEL',
    ids: models.filter((m) => /image|banana/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace('models/', '')) };
}

if (!['openai', 'gemini'].includes(provider)) fail(`AI_PROVIDER is "${provider}". Set it to openai or gemini to list models.`);
const { current, envVar, ids } = provider === 'openai' ? await openaiModels() : await geminiModels();
console.log(`${provider} image models available to your key (${envVar} is currently "${current}"):\n`);
for (const id of ids) console.log(`${id === current ? '✔' : ' '} ${id}`);
if (!ids.includes(current)) console.log(`\n⚠ "${current}" is not in this list. Set ${envVar} in .env to one of the IDs above.`);
