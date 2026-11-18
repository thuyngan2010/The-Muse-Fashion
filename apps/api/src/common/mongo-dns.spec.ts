import { describe, expect, it, vi } from 'vitest';

const setServers = vi.fn();
vi.mock('node:dns', () => ({ setServers }));

describe('applyMongoDnsServers', () => {
  it('keeps system DNS when MONGODB_DNS_SERVERS is empty', async () => {
    const { applyMongoDnsServers } = await import('./mongo-dns.js');
    setServers.mockClear();
    expect(applyMongoDnsServers('')).toEqual([]);
    expect(applyMongoDnsServers(undefined)).toEqual([]);
    expect(setServers).not.toHaveBeenCalled();
  });

  it('uses the listed DNS servers, ignoring spaces and empty entries', async () => {
    const { applyMongoDnsServers } = await import('./mongo-dns.js');
    setServers.mockClear();
    expect(applyMongoDnsServers(' 8.8.8.8, ,1.1.1.1 ')).toEqual(['8.8.8.8', '1.1.1.1']);
    expect(setServers).toHaveBeenCalledWith(['8.8.8.8', '1.1.1.1']);
  });
});
