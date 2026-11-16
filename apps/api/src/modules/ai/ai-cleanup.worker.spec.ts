import { describe, expect, it, vi } from 'vitest';
import { AiCleanupWorker } from './ai-cleanup.worker.js';

describe('AiCleanupWorker', () => {
  it('finishes cleanup for expired terminal jobs with no keys', async () => {
    const job = { _id: 'job-1', state: 'FAILED', terminalAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      inputKeys: [], outputKeys: [], inputCleanupDone: false, outputCleanupDone: false,
      renderPlan: { prompt: 'Private visual descriptions' } };
    const updateOne = vi.fn().mockReturnValue({ exec: async () => ({ modifiedCount: 1 }) });
    const jobs = { find: vi.fn().mockReturnValue({ sort: () => ({ limit: () => ({ lean: () => ({ exec: async () => [job] }) }) }) }),
      updateOne };
    const worker = new AiCleanupWorker(jobs as never, {} as never, {} as never);

    expect(await worker.run()).toBe(2);
    expect(updateOne).toHaveBeenCalledWith({ _id: job._id },
      { $set: { state: 'EXPIRED', inputCleanupDone: true, outputCleanupDone: true }, $unset: { renderPlan: 1 } });
  });
  it('keeps the plan while only the input retention deadline has elapsed', async () => {
    const job = { _id: 'job-2', state: 'COMPLETED', terminalAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      inputKeys: [], outputKeys: [], inputCleanupDone: false, outputCleanupDone: false,
      renderPlan: { prompt: 'Plan still within the output retention period' } };
    const updateOne = vi.fn().mockReturnValue({ exec: async () => ({ modifiedCount: 1 }) });
    const jobs = { find: () => ({ sort: () => ({ limit: () => ({ lean: () => ({ exec: async () => [job] }) }) }) }), updateOne };
    const worker = new AiCleanupWorker(jobs as never, {} as never, {} as never);
    expect(await worker.run()).toBe(1);
    expect(updateOne).toHaveBeenCalledWith({ _id: job._id }, { $set: { inputCleanupDone: true } });
  });
});
