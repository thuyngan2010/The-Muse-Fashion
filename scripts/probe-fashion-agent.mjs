import 'reflect-metadata';
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AiFashionPlannerService } from '../apps/api/dist/modules/ai/ai-fashion-planner.service.js';
import { AiProviderService } from '../apps/api/dist/modules/ai/ai-provider.service.js';

// Draw synthetic, non-personal image fixtures. No customer images or records are read.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(width, height, shapes) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let color = [248, 248, 248];
    for (const shape of shapes) if (shape.test(x, y)) color = shape.color;
    const offset = y * (width * 3 + 1) + 1 + x * 3;
    raw[offset] = color[0]; raw[offset + 1] = color[1]; raw[offset + 2] = color[2];
  }
  function chunk(type, data) {
    const t = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
    length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([length, t, data, crc]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const rect = (x1, y1, x2, y2, color) => ({ color, test: (x, y) => x >= x1 && x <= x2 && y >= y1 && y <= y2 });
const ellipse = (cx, cy, rx, ry, color) => ({ color, test: (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 });
const skin = [182, 126, 85], dark = [35, 35, 45], blue = [45, 100, 195], red = [205, 40, 50];
const person = png(384, 640, [
  ellipse(192, 100, 48, 58, skin), rect(175, 140, 208, 180, skin), rect(125, 175, 260, 350, blue),
  rect(95, 185, 124, 375, skin), rect(261, 185, 290, 375, skin), ellipse(110, 382, 18, 22, skin), ellipse(276, 382, 18, 22, skin),
  rect(133, 350, 186, 570, dark), rect(198, 350, 252, 570, dark), ellipse(156, 580, 40, 17, dark), ellipse(230, 580, 40, 17, dark),
  ellipse(176, 93, 4, 4, dark), ellipse(207, 93, 4, 4, dark), rect(177, 124, 208, 127, dark),
]);
const hat = png(256, 256, [rect(78, 55, 179, 155, blue), rect(35, 155, 220, 177, blue), rect(78, 130, 179, 150, [235, 195, 40])]);
const shoes = png(320, 256, [
  rect(45, 40, 112, 110, red), ellipse(140, 105, 98, 33, red), rect(42, 120, 238, 136, dark),
  rect(45, 155, 112, 215, red), ellipse(140, 210, 98, 30, red), rect(42, 225, 238, 241, dark),
]);
const url = image => `data:image/png;base64,${image.toString('base64')}`;
const localTime = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Saigon', dateStyle: 'short', timeStyle: 'medium' }).format(new Date());
const folder = resolve('reports/fashion-agent', localTime.replace(/[^0-9-]/g, '-'));
await mkdir(folder, { recursive: true });
const report = { localTime, timezone: 'Asia/Saigon', syntheticFixtures: true, stages: [], plannerModel: process.env.AI_PLANNER_MODEL };
try {
  const planner = new AiFashionPlannerService();
  const plan = await planner.plan({ type: 'MIX_MATCH', inputUrl: url(person), products: [
    { id: '000000000000000000000001', name: 'Reference A', description: '', material: '', imageUrl: url(hat) },
    { id: '000000000000000000000002', name: 'Reference B', description: '', material: '', imageUrl: url(shoes) },
  ] }, async phase => { report.stages.push(phase); console.log(`STAGE ${phase}`); });
  report.plan = plan;
  report.visualDetectionPass = plan.detectedItems.some(p => p.category === 'hat') && plan.detectedItems.some(p => p.category === 'shoes');
  if (!report.visualDetectionPass) throw new Error('Synthetic hat/shoes reference categories did not match');
  console.log(JSON.stringify({ detectedItems: plan.detectedItems, summary: plan.summary, visualDetectionPass: true }));
  try {
    await planner.plan({ type: 'TRY_ON', inputUrl: url(png(128, 128, [])), products: [
      { id: '000000000000000000000001', name: 'Reference A', description: '', material: '', imageUrl: url(hat) },
    ] });
    report.noPersonRejected = false;
  } catch (error) { report.noPersonRejected = error.name === 'Error' && error.message.includes('đúng một người'); }
  if (!report.noPersonRejected) throw new Error('Empty synthetic scene was not safely rejected');
  console.log('PASS no-person image rejected before rendering');
  if (process.env.AI_FASHION_PROBE_RENDER === 'true') {
    report.renderRequested = true;
    const rendered = await new AiProviderService().runJob({ jobId: `fashion-probe-${Date.now()}`, type: 'MIX_MATCH',
      inputUrl: url(person), productImageUrls: [url(hat), url(shoes)], prompt: plan.prompt });
    report.renderStatus = rendered.status;
    if (rendered.status === 'COMPLETED') {
      const extension = rendered.contentType.split('/')[1];
      await writeFile(resolve(folder, `output.${extension}`), rendered.outputBytes);
      report.renderFile = `output.${extension}`;
    } else {
      report.renderError = rendered.status === 'FAILED' ? rendered.message : 'Asynchronous rendering requires normal worker polling.';
      process.exitCode = 1;
    }
    console.log(JSON.stringify({ renderStatus: report.renderStatus, renderError: report.renderError }));
  }
} catch (error) { report.error = error.message; console.log(JSON.stringify({ error: report.error })); process.exitCode = 1; }
await writeFile(resolve(folder, 'probe.json'), JSON.stringify(report, null, 2));
console.log(`REPORT ${resolve(folder, 'probe.json')}`);
