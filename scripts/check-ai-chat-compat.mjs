import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import OpenAI from 'openai';

// Opt-in live compatibility probes. No application data, external tools, or stored completions.
const replayPath = process.argv[2] === '--summarize' ? process.argv[3] : undefined;
const previous = replayPath ? JSON.parse(await readFile(resolve(replayPath), 'utf8')) : null;
const base = process.env.AI_API_BASE_URL?.replace(/\/+$/, '') ?? previous?.endpoint;
const key = process.env.AI_API_KEY ?? (previous ? '[not-used]' : undefined);
const model = process.env.AI_CHAT_TEST_MODEL ?? previous?.model ?? 'gpt-6-thinking';
if (!base || !key) throw new Error('AI_API_BASE_URL and AI_API_KEY are required');
const startedAt = previous ? new Date(previous.startedAt.replace(' ', 'T') + '+07:00') : new Date();
const startedLocal = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Saigon', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(startedAt);
const directory = replayPath ? dirname(resolve(replayPath)) : resolve('reports/ai-compat', startedLocal.replace(/[: ]/g, '-'));
await mkdir(directory, { recursive: true });
const source = 'https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create';
const results = [];
let checkpointWrites = Promise.resolve();
const okMessage = { role: 'user', content: 'Reply with exactly OK.' };
const baseline = { model, messages: [okMessage], max_completion_tokens: 1024, stream: false };
const weather = { type: 'function', function: { name: 'get_weather', description: 'Get the temperature for a city.', strict: true,
  parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'], additionalProperties: false } } };
const toolPrompt = [{ role: 'user', content: 'Call get_weather for Paris. Do not answer from memory.' }];
const clean = (value) => JSON.parse(JSON.stringify(value, (_k, v) => typeof v === 'string' ? v.split(key).join('[REDACTED]') : v));
const message = (body) => body?.choices?.[0]?.message?.content ?? '';
const validUsage = (usage) => usage && ['prompt_tokens', 'completion_tokens', 'total_tokens'].every(
  k => Number.isInteger(usage[k]) && usage[k] >= 0,
) && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens;
function envelope(body) {
  const errors = [];
  if (!body || body.object !== 'chat.completion') errors.push('object must be chat.completion');
  if (typeof body?.id !== 'string' || !body.id) errors.push('missing id');
  if (!Number.isInteger(body?.created) || body.created < 1) errors.push('created must be a Unix timestamp');
  if (typeof body?.model !== 'string' || !body.model) errors.push('missing model');
  if (!Array.isArray(body?.choices) || !body.choices.length) errors.push('missing choices');
  for (const choice of body?.choices ?? []) {
    if (!Number.isInteger(choice.index)) errors.push('choice.index must be an integer');
    if (choice.message?.role !== 'assistant') errors.push('message.role must be assistant');
    if (choice.message?.content !== null && typeof choice.message?.content !== 'string') errors.push('message.content must be string or null');
    if (!['stop', 'length', 'tool_calls', 'function_call', 'content_filter'].includes(choice.finish_reason)) errors.push('invalid finish_reason');
  }
  if (body?.usage && !validUsage(body.usage)) errors.push('invalid usage counters');
  return errors;
}
function toolErrors(body, required = true) {
  const calls = body?.choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(calls) || !calls.length) return required ? ['no tool_calls returned'] : [];
  const errors = [];
  if (body.choices[0].finish_reason !== 'tool_calls') errors.push('finish_reason must be tool_calls');
  for (const call of calls) {
    if (typeof call.id !== 'string' || !call.id || call.type !== 'function' || call.function?.name !== 'get_weather') errors.push('invalid function call envelope');
    try {
      const args = JSON.parse(call.function.arguments);
      if (typeof args.city !== 'string') errors.push('tool arguments violate schema');
    } catch { errors.push('tool arguments are not JSON'); }
  }
  return errors;
}
function errorEnvelope(body) {
  const error = body?.error;
  if (!error || typeof error.message !== 'string' || typeof error.type !== 'string') return ['error must contain message and type'];
  return [];
}
function sample(body) {
  return { id: body?.id, object: body?.object, model: body?.model, created: body?.created,
    choices: body?.choices?.map(c => ({ index: c.index, finish_reason: c.finish_reason,
      message: { role: c.message?.role, content: typeof c.message?.content === 'string' ? c.message.content.slice(0, 1600) : c.message?.content, tool_calls: c.message?.tool_calls,
        function_call: c.message?.function_call }, logprobs: c.logprobs })), usage: body?.usage,
    error: body?.error, output: body?.output?.map(o => ({ type: o.type, role: o.role,
      content: o.content?.filter(c => c.type === 'output_text').map(c => ({ type: c.type, text: c.text?.slice(0, 800) })) })) };
}
const tests = [];
const add = (name, body = {}, check = () => [], options = {}) => tests.push({ name, body, check, ...options });
const equal = expected => body => message(body).trim() === expected ? [] : [`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(message(body).slice(0, 160))}`];

add('01 basic JSON and response envelope', {}, equal('OK'));
add('02 multi-turn conversation', { messages: [
  { role: 'user', content: 'Remember the code LIME42.' }, { role: 'assistant', content: 'Remembered.' },
  { role: 'user', content: 'Reply only with the code I supplied.' },
] }, equal('LIME42'));
add('03 system instruction priority', { messages: [{ role: 'system', content: 'Reply with exactly SYSTEM_OK.' }, okMessage] }, equal('SYSTEM_OK'));
add('04 developer role', { messages: [{ role: 'developer', content: 'Reply with exactly DEV_OK.' }, okMessage] }, equal('DEV_OK'), { optional: true });
add('05 array text content parts', { messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly PARTS_OK.' }] }] }, equal('PARTS_OK'));
add('06 Vietnamese Unicode', { messages: [{ role: 'user', content: 'Chỉ trả lời chính xác: Xin chào Việt Nam 🌿' }] }, equal('Xin chào Việt Nam 🌿'));
add('07 exact-text instruction with quotes/newlines', { messages: [{ role: 'user', content: 'Repeat exactly the text between <text> and </text>, without fences: <text>A "quote"\nB \\ slash</text>' }] }, equal('A "quote"\nB \\ slash'), { note: 'Prompt-following check. Extra text is not, by itself, a JSON wire-escaping defect.' });
add('08 multiple choices n=2', { n: 2 }, body => body.choices?.length === 2 && new Set(body.choices.map(c => c.index)).size === 2 ? [] : ['n=2 did not return two distinct choices'], { optional: true });
add('09 temperature=0 acceptance', { temperature: 0 }, equal('OK'), { optional: true, note: 'Acceptance only; sampling semantics cannot be proven by one sample.' });
add('10 top_p acceptance', { top_p: 0.5 }, equal('OK'), { optional: true, note: 'Acceptance only; not a statistical sampler test.' });
add('11 frequency and presence penalties', { frequency_penalty: 0.5, presence_penalty: 0.5 }, equal('OK'), { optional: true, note: 'Acceptance only.' });
const counting = [{ role: 'user', content: 'Count from 1 to 30, separated by spaces. Output every number.' }];
const limitCheck = body => {
  const errors = [];
  if (body.choices?.[0]?.finish_reason !== 'length') errors.push('truncated completion must finish with length');
  if (body.usage?.completion_tokens > 1) errors.push('completion token cap was exceeded');
  if (!body.usage) errors.push('usage missing; cannot verify token cap');
  return errors;
};
add('12 max_completion_tokens=1 enforced', { messages: counting, max_completion_tokens: 1 }, limitCheck, { optional: true });
add('13 legacy max_tokens=1 enforced', { messages: counting, max_completion_tokens: undefined, max_tokens: 1 }, limitCheck, { optional: true });
add('14 stop sequence enforced', { messages: [{ role: 'user', content: 'Reply exactly ALPHA<END>BETA with no other text.' }], stop: ['<END>'] }, equal('ALPHA'), { optional: true });
add('15 JSON object output', { messages: [{ role: 'user', content: 'Return a JSON object with ok=true and count=3. No markdown.' }], response_format: { type: 'json_object' } }, body => {
  try { const v = JSON.parse(message(body)); return v.ok === true && v.count === 3 ? [] : ['JSON values do not match']; }
  catch { return ['content is not a JSON object']; }
}, { optional: true });
add('16 strict JSON schema against conflicting prompt', {
  messages: [{ role: 'user', content: 'Reply in plain prose: NOT_JSON. Add an extra field named extra if you return JSON.' }],
  response_format: { type: 'json_schema', json_schema: { name: 'compat_result', strict: true, schema: {
    type: 'object', properties: { answer: { type: 'string', enum: ['OK'] }, count: { type: 'integer', enum: [1] } },
    required: ['answer', 'count'], additionalProperties: false,
  } } },
}, body => {
  try { const v = JSON.parse(message(body)); return v.answer === 'OK' && v.count === 1 && Object.keys(v).length === 2 ? [] : ['strict schema violated']; }
  catch { return ['strict schema ignored: output is not JSON']; }
}, { optional: true });
add('17 forced named function tool', { messages: toolPrompt, tools: [weather], tool_choice: { type: 'function', function: { name: 'get_weather' } } }, body => toolErrors(body), { optional: true });
add('18 required function tool', { messages: toolPrompt, tools: [weather], tool_choice: 'required' }, body => toolErrors(body), { optional: true });
add('19 tool_choice none', { tools: [weather], tool_choice: 'none' }, body => body.choices?.some(c => c.message?.tool_calls?.length) ? ['tool call emitted despite tool_choice none'] : equal('OK')(body), { optional: true });
add('20 function tool result round trip', { tools: [weather], messages: [
  { role: 'user', content: 'What is the temperature in Paris? Reply only with the numeric temperature returned by the tool.' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'call_compat_paris', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } }] },
  { role: 'tool', tool_call_id: 'call_compat_paris', content: '{"temperature":21}' },
] }, equal('21'), { optional: true });
add('21 parallel tool calls', { messages: [{ role: 'user', content: 'Call get_weather for BOTH Paris and Tokyo. Make two calls in this response.' }], tools: [weather], tool_choice: 'required', parallel_tool_calls: true }, body => toolErrors(body), {
  optional: true, inspect: body => ({ parallelCallCount: body.choices?.[0]?.message?.tool_calls?.length ?? 0 }),
  note: 'Parallel calls are permitted, not guaranteed; count is reported separately.',
});
add('22 reasoning_effort low acceptance', { reasoning_effort: 'low' }, equal('OK'), { optional: true, note: 'Acceptance only; cannot verify internal reasoning behavior.' });
add('23 seed acceptance', { seed: 42 }, equal('OK'), { optional: true, note: 'Acceptance only; OpenAI does not promise deterministic output.' });
add('24 logprobs and top_logprobs', { logprobs: true, top_logprobs: 2 }, body => {
  const list = body.choices?.[0]?.logprobs?.content;
  return Array.isArray(list) && list.length && list.every(t => typeof t.token === 'string' && typeof t.logprob === 'number' && Array.isArray(t.top_logprobs)) ? [] : ['logprobs requested but missing or malformed'];
}, { optional: true });
add('25 legacy functions/function_call', { messages: toolPrompt, functions: [weather.function], function_call: { name: 'get_weather' } }, body => {
  const call = body.choices?.[0]?.message?.function_call;
  if (call?.name !== 'get_weather' || typeof call.arguments !== 'string') return ['legacy function_call missing'];
  try { return JSON.parse(call.arguments).city === 'Paris' ? [] : ['wrong legacy arguments']; } catch { return ['legacy arguments are not JSON']; }
}, { optional: true });
add('26 vision input with synthetic image', { messages: [{ role: 'user', content: [
  { type: 'text', text: 'Acknowledge that an image was attached. Reply with exactly IMAGE_OK.' },
  { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=' } },
] }] }, equal('IMAGE_OK'), { optional: true, note: 'Tests image-input acceptance, not vision accuracy or image generation.' });

add('27 SSE normal', { stream: true }, null, { streaming: true });
add('28 SSE include_usage', { stream: true, stream_options: { include_usage: true } }, null, { streaming: true, usageRequired: true });
add('29 SSE tool-call deltas', { stream: true, messages: toolPrompt, tools: [weather], tool_choice: { type: 'function', function: { name: 'get_weather' } } }, null, { streaming: true, toolStream: true, optional: true });
add('30 SSE n=2 choices', { stream: true, n: 2 }, null, { streaming: true, expectedChoices: 2, optional: true });

const negative = (name, body, statuses = [400, 422], options = {}) => add(name, body, null, { negative: true, expectedStatuses: statuses, ...options });
negative('31 missing authentication', {}, [401], { auth: 'missing' });
negative('32 invalid API key', {}, [401], { auth: 'invalid' });
negative('33 nonexistent model', { model: 'compat-definitely-nonexistent-model-20261026' }, [400, 404]);
negative('34 missing model', { model: undefined });
negative('35 missing messages', { messages: undefined });
negative('36 empty messages', { messages: [] });
negative('37 messages wrong type', { messages: 'not-an-array' });
negative('38 invalid message role', { messages: [{ role: 'invalid_role', content: 'OK' }] });
negative('39 temperature outside range', { temperature: 3 });
negative('40 n=0 rejected', { n: 0 });
negative('41 negative token limit', { max_completion_tokens: -1 });
negative('42 malformed JSON body', {}, [400], { rawBody: '{invalid json' });
negative('43 malformed tool declaration', { tools: [{ type: 'function', function: { parameters: {} } }], tool_choice: 'required' });
negative('44 GET chat/completions rejected', {}, [404, 405], { method: 'GET' });
negative('45 nonexistent endpoint', {}, [404], { path: '/compat-nonexistent-endpoint' });
negative('46 invalid response_format', { response_format: { type: 'compat_invalid_format' } });
negative('47 stream with invalid stream_options', { stream: true, stream_options: 'invalid' });
negative('48 orphan tool result', { messages: [{ role: 'tool', tool_call_id: 'call_nonexistent', content: '21' }, okMessage] });
add('49 models list', {}, body => body?.object === 'list' && Array.isArray(body.data)
  && body.data.every(m => typeof m.id === 'string' && m.object === 'model') ? [] : ['invalid models list envelope'], {
  path: '/models', method: 'GET', kind: 'models', optional: true,
});
add('50 retrieve requested model', {}, body => body?.id === model && body?.object === 'model' ? [] : ['invalid model object'], {
  path: `/models/${encodeURIComponent(model)}`, method: 'GET', kind: 'model', optional: true,
});
add('51 Responses API basic probe', { model, input: 'Reply with exactly OK.', max_output_tokens: 1024 }, body => {
  const text = body?.output?.flatMap(o => o.content ?? []).filter(c => c.type === 'output_text').map(c => c.text).join('') ?? '';
  return body?.object === 'response' && typeof body.id === 'string' && text.trim() === 'OK' ? [] : ['not a valid Responses output with OK text'];
}, { path: '/responses', standaloneBody: true, kind: 'responses', optional: true });
add('52 OpenAI SDK parsing', {}, equal('OK'), { sdk: true });

async function sse(response, test) {
  const errors = [];
  if (!response.headers.get('content-type')?.includes('text/event-stream')) errors.push('stream content-type must be text/event-stream');
  const text = await response.text();
  const frames = text.replace(/\r\n/g, '\n').split('\n\n').map(frame => frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n')).filter(Boolean);
  const chunks = [];
  let done = false;
  for (const frame of frames) {
    if (frame.trim() === '[DONE]') { done = true; continue; }
    if (done) errors.push('data emitted after DONE');
    try { chunks.push(JSON.parse(frame)); } catch { errors.push('invalid SSE JSON frame'); }
  }
  if (!done) errors.push('missing data: [DONE]');
  if (!chunks.length) errors.push('no stream chunks');
  const choices = new Map();
  const ids = new Set();
  const models = new Set();
  let usage;
  let usageChunk = false;
  for (const chunk of chunks) {
    if (chunk.object !== 'chat.completion.chunk') errors.push('invalid chunk.object');
    if (typeof chunk.id !== 'string' || !Number.isInteger(chunk.created) || typeof chunk.model !== 'string') errors.push('chunk lacks id/created/model');
    ids.add(chunk.id); models.add(chunk.model);
    if (!Array.isArray(chunk.choices)) { errors.push('chunk.choices is not an array'); continue; }
    if (chunk.usage) { usage = chunk.usage; usageChunk ||= chunk.choices.length === 0; }
    for (const c of chunk.choices) {
      if (!Number.isInteger(c.index) || !c.delta || typeof c.delta !== 'object') { errors.push('invalid streamed choice/delta'); continue; }
      const item = choices.get(c.index) ?? { content: '', finishReason: null, tools: new Map() };
      if (c.delta.content != null && typeof c.delta.content !== 'string') errors.push('delta.content is not text');
      item.content += c.delta.content ?? '';
      if (c.finish_reason) item.finishReason = c.finish_reason;
      for (const call of c.delta.tool_calls ?? []) {
        if (!Number.isInteger(call.index)) errors.push('tool delta lacks index');
        const acc = item.tools.get(call.index) ?? { id: '', type: '', function: { name: '', arguments: '' } };
        acc.id += call.id ?? ''; acc.type = call.type ?? acc.type;
        acc.function.name += call.function?.name ?? ''; acc.function.arguments += call.function?.arguments ?? '';
        item.tools.set(call.index, acc);
      }
      choices.set(c.index, item);
    }
  }
  if (ids.size > 1 || models.size > 1) errors.push('stream id/model changed across chunks');
  if (choices.size !== (test.expectedChoices ?? 1)) errors.push('wrong number of streamed choices');
  for (const item of choices.values()) {
    if (!item.finishReason) errors.push('no terminal finish_reason');
    if (test.toolStream) errors.push(...toolErrors({ choices: [{ finish_reason: item.finishReason, message: { tool_calls: [...item.tools.values()] } }] }));
    else if (item.content.trim() !== 'OK') errors.push('stream did not reconstruct OK');
  }
  if (test.usageRequired && (!validUsage(usage) || !usageChunk)) errors.push('include_usage requested but final empty-choices usage chunk is missing or invalid');
  return { errors, evidence: { chunks: chunks.length, done, idsStable: ids.size === 1, models: [...models], usage: usage ?? null,
    nonstandardFrames: chunks.filter(c => c.object !== 'chat.completion.chunk').map(c => ({ keys: Object.keys(c), error: c.error, usage: c.usage,
      prompt_tokens: c.prompt_tokens, completion_tokens: c.completion_tokens, total_tokens: c.total_tokens })),
    choices: [...choices.entries()].map(([index, c]) => ({ index, content: c.content.slice(0, 1200), finishReason: c.finishReason, tool_calls: [...c.tools.values()] })) } };
}

async function run(test) {
  const start = Date.now();
  const result = { name: test.name, state: 'ERROR', note: test.note, request: test.standaloneBody ? test.body : { ...baseline, ...test.body } };
  try {
    if (test.sdk) {
      const sdk = new OpenAI({ apiKey: key, baseURL: base, organization: null, project: null, timeout: 60_000, maxRetries: 0,
        fetch: (url, options) => fetch(url, { ...options, redirect: 'error' }) });
      const { data, response } = await sdk.chat.completions.create(result.request).withResponse();
      result.httpStatus = response.status;
      result.errors = [...envelope(data), ...test.check(data)];
      result.evidence = sample(data);
      result.state = result.errors.length ? 'FAIL' : 'PASS';
    } else {
      const headers = { 'Content-Type': 'application/json' };
      if (test.auth !== 'missing') headers.Authorization = `Bearer ${test.auth === 'invalid' ? 'compat-test-invalid-key' : key}`;
      const response = await fetch(`${base}${test.path ?? '/chat/completions'}`, {
        method: test.method ?? 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(60_000),
        ...((test.method ?? 'POST') === 'GET' ? {} : { body: test.rawBody ?? JSON.stringify(result.request) }),
      });
      result.httpStatus = response.status;
      result.contentType = response.headers.get('content-type');
      if (!response.ok || test.negative) {
        const raw = await response.text();
        let body;
        try { body = JSON.parse(raw); } catch { body = { nonJsonBody: raw.slice(0, 400) }; }
        result.evidence = body.error ? { error: body.error } : body.nonJsonBody ? body : sample(body);
        result.errors = errorEnvelope(body);
        if (test.negative) {
          if (!test.expectedStatuses.includes(response.status)) result.errors.unshift(`expected HTTP ${test.expectedStatuses.join('/')}, got ${response.status}`);
          result.state = result.errors.length ? 'FAIL' : 'PASS';
        } else if (response.status >= 500 || response.status === 429) result.state = 'ERROR';
        else if (test.optional && ![401, 403].includes(response.status) && !result.errors.length) result.state = 'UNSUPPORTED';
        else { result.state = 'FAIL'; result.errors.unshift(`request rejected with HTTP ${response.status}`); }
      } else if (test.streaming) {
        const parsed = await sse(response, test);
        result.errors = parsed.errors;
        result.evidence = parsed.evidence;
        result.state = result.errors.length ? 'FAIL' : 'PASS';
      } else {
        const text = await response.text();
        let body;
        try { body = JSON.parse(text); }
        catch {
          result.state = 'FAIL';
          result.errors = ['successful response is not JSON'];
          result.evidence = { nonJsonBody: text.slice(0, 400) };
          throw Object.assign(new Error('successful response is not JSON'), { protocolFailure: true });
        }
        result.errors = [...(!test.kind ? envelope(body) : []), ...test.check(body)];
        if (!response.headers.get('content-type')?.includes('application/json')) result.errors.push('JSON response has wrong content-type');
        result.evidence = test.kind === 'models' ? { object: body.object, modelCount: body.data?.length,
          requestedModelListed: body.data?.some(m => m.id === model) } : test.kind === 'model' ? body : sample(body);
        Object.assign(result.evidence, test.inspect?.(body));
        result.state = result.errors.length ? 'FAIL' : 'PASS';
      }
    }
  } catch (error) {
    result.errors = [String(error.message)];
    result.httpStatus ??= error.status;
    result.state = error.protocolFailure ? 'FAIL' : 'ERROR';
  }
  result.elapsedMs = Date.now() - start;
  const sanitized = clean(result);
  results.push(sanitized);
  checkpointWrites = checkpointWrites.then(() => writeFile(resolve(directory, 'results.partial.json'), JSON.stringify(results, null, 2)));
  await checkpointWrites;
  console.log(`${sanitized.state.padEnd(11)} ${test.name} | HTTP ${sanitized.httpStatus ?? '-'} | ${sanitized.elapsedMs}ms${sanitized.errors?.length ? ' | ' + sanitized.errors.join('; ').slice(0, 200) : ''}`);
}

// Two in-flight probes, not a load/rate-limit test.
let cursor = 0;
if (previous) results.push(...previous.results);
else await Promise.all(Array.from({ length: 2 }, async () => {
    while (cursor < tests.length) await run(tests[cursor++]);
  }));
results.sort((a, b) => a.name.localeCompare(b.name));
for (const result of results) {
  const number = Number.parseInt(result.name, 10);
  result.category = [2, 3, 4, 6, 7].includes(number) ? 'prompt-following' : number >= 31 && number <= 50 ? 'protocol-validation' : 'capability';
  if (number === 7) {
    result.name = '07 exact-text instruction with quotes/newlines';
    result.note = 'Prompt-following check, not proof of a JSON wire-escaping defect.';
  }
  if (result.state === 'FAIL' && result.category === 'prompt-following' && !envelope(result.evidence).length) result.state = 'BEHAVIOR_FAIL';
  if (number === 50 && result.httpStatus === 200 && !result.contentType?.includes('application/json')) {
    result.state = 'FAIL';
    result.errors = ['model metadata endpoint returned HTTP 200 with HTML instead of JSON'];
  }
}
const counts = Object.fromEntries(['PASS', 'FAIL', 'BEHAVIOR_FAIL', 'UNSUPPORTED', 'ERROR'].map(s => [s, results.filter(r => r.state === s).length]));
const endpoint = new URL(base);
const report = { startedAt: startedLocal, timezone: 'Asia/Saigon', endpoint: endpoint.origin + endpoint.pathname, model,
  scope: 'Chat Completions, SSE, function tools, validation/authentication, model discovery; one Responses API probe.',
  exclusions: 'Not an OpenAI certification. No audio, image generation/editing, embeddings, uploads, stored-completion CRUD, rate-limit stress, billing, or exhaustive parameter-combination testing. Optional capability rejection is distinct from malformed output. Accepted sampler/reasoning parameters do not prove their implementation. BEHAVIOR_FAIL denotes observed prompt-following failures, not a malformed JSON response or proof that the gateway drops roles. FAIL includes strict HTTP-status differences from OpenAI as well as silently ignored feature settings.',
  reference: source, counts, durationMs: previous?.durationMs ?? Date.now() - startedAt.getTime(), results };
await writeFile(resolve(directory, 'results.json'), JSON.stringify(report, null, 2));
const escapeCell = text => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const markdown = [
  `# AI compatibility report: ${model}`, '', `Time: ${startedLocal} (Asia/Saigon)`, `Endpoint: ${report.endpoint}`, '',
  `Reference: [OpenAI Chat Completions](${source})`, '', `Scope: ${report.scope}`, '', report.exclusions, '',
  `Results: ${JSON.stringify(counts)}`, '', '| Case | Result | HTTP | Time | Findings |', '|---|---|---:|---:|---|',
  ...results.map(r => `| ${escapeCell(r.name)} | ${r.state} | ${r.httpStatus ?? '-'} | ${(r.elapsedMs / 1000).toFixed(1)}s | ${escapeCell(r.errors?.join('; ') || r.note || '')} |`),
  '', 'Full sanitized evidence and request bodies: results.json. API keys and request Authorization headers are not included.', '',
].join('\n');
await writeFile(resolve(directory, 'report.md'), markdown);
console.log(JSON.stringify({ counts, report: resolve(directory, 'report.md'), evidence: resolve(directory, 'results.json') }));
if (counts.FAIL || counts.ERROR || counts.BEHAVIOR_FAIL) process.exitCode = 1;
