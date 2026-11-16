import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiFashionPlannerService } from './ai-fashion-planner.service.js';

const input = { type: 'TRY_ON' as const, inputUrl: 'https://storage.test/private-person?signature=fixture',
  products: [{ id: 'p1', name: 'Shoes', description: '', material: 'leather', imageUrl: 'https://storage.test/shoes' }] };
const analysis = { person: { count: 1, pose: 'standing', visibleRegions: ['feet'] },
  products: [{ productId: 'p1', category: 'shoes', targetRegion: 'feet', confidence: 0.96, details: 'Black leather shoes.' }] };
const styling = { compatible: true, explanation: 'Phù hợp.', summary: 'Giày da đen.',
  items: [{ productId: 'p1', action: 'replace', notes: 'Fit both feet.' }] };
const response = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));

beforeEach(() => {
  vi.stubEnv('AI_PLANNER_ENABLED', 'true'); vi.stubEnv('AI_PLANNER_BASE_URL', 'https://planner.test/v1');
  vi.stubEnv('AI_PLANNER_API_KEY', 'planner-key'); vi.stubEnv('AI_PLANNER_MODEL', 'vision-model');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Bounded fashion vision/planning workflow', () => {
  it('analyzes image references first, then plans and builds a category-aware prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(analysis)).mockResolvedValueOnce(response(styling));
    vi.stubGlobal('fetch', fetchMock);
    const phase = vi.fn().mockResolvedValue(undefined);
    const plan = await new AiFashionPlannerService().plan({ ...input, style: 'office' }, phase);
    expect(phase.mock.calls.map(([v]) => v)).toEqual(['ANALYZING', 'PLANNING']);
    const requests = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(requests[0].response_format).toEqual({ type: 'json_object' });
    expect(requests[0].messages[1].content.filter((p: { type: string }) => p.type === 'image_url').map((p: { image_url: { url: string } }) => p.image_url.url)).toEqual([input.inputUrl, input.products[0].imageUrl]);
    expect(requests[1].messages[1].content).toContain('"category":"shoes"');
    expect(requests[1].messages[1].content).toContain('"style":"office"');
    expect(plan.prompt).toContain('Replace footwear only');
    expect(JSON.stringify(plan)).not.toContain('signature=');
    expect(fetchMock.mock.calls[0][1].redirect).toBe('error');
  });
  it('repairs invalid model JSON once and still validates product ids', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ wrong: true }))
      .mockResolvedValueOnce(response(analysis)).mockResolvedValueOnce(response(styling));
    vi.stubGlobal('fetch', fetchMock);
    expect((await new AiFashionPlannerService().plan(input)).summary).toBe('Giày da đen.');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('stops after one failed correction rather than trusting malformed analysis', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => response({ wrong: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new AiFashionPlannerService().plan(input)).rejects.toThrow('failed validation');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not plan an outfit for a photo without a person', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ ...analysis, person: { ...analysis.person, count: 0 } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new AiFashionPlannerService().plan(input)).rejects.toThrow('đúng một người');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('bounds provider output and never follows redirects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x'.repeat(65537))));
    await expect(new AiFashionPlannerService().plan(input)).rejects.toThrow('exceeds limit');
  });
  it('does not expose the planner key when the upstream rejects the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private error body', { status: 401 })));
    await expect(new AiFashionPlannerService().plan(input)).rejects.toThrow('Fashion planner HTTP 401');
  });
});
