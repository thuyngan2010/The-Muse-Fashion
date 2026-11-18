import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { UsersService } from './users.service.js';

describe('UsersService.displayNames', () => {
  it('returns only full names for valid ids and skips invalid or empty ids', async () => {
    const id = new Types.ObjectId();
    const find = vi.fn().mockReturnValue({ select: () => ({ lean: () => ({ exec: async () => [{ _id: id, fullName: 'Nguyễn An' }] }) }) });
    const service = new UsersService({ find } as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const names = await service.displayNames([String(id), 'not-an-id', null, undefined, String(id)]);
    expect(names.get(String(id))).toBe('Nguyễn An');
    expect(find.mock.calls[0][0]).toEqual({ _id: { $in: [String(id)] } });
    expect(find.mock.results[0].value).toBeDefined();
  });

  it('does not query when nothing valid is given', async () => {
    const find = vi.fn();
    const service = new UsersService({ find } as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    expect((await service.displayNames(['x', null])).size).toBe(0);
    expect(find).not.toHaveBeenCalled();
  });
});
