import { Injector, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from './api.service';

describe('Image upload transport', () => {
  let api: ApiService;
  let post: ReturnType<typeof vi.fn>;
  const file = new File(['test'], 'photo.webp', { type: 'image/webp' });
  const signed = { uploadUrl: 'https://r2.example.test/signed', objectKey: 'tryon/owner/photo.webp',
    requiredHeaders: { 'Content-Type': 'image/webp', 'If-None-Match': '*' } };

  beforeEach(() => {
    post = vi.fn(() => of({ uploaded: true }));
    const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: { post } }] });
    api = runInInjectionContext(injector, () => new ApiService());
    vi.spyOn(api, 'presignUpload').mockReturnValue(of(signed));
    vi.spyOn(api, 'finalizeUpload').mockReturnValue(of({ id: 'media', status: 'ACTIVE' }));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('uploads directly with the signed headers and then finalizes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await firstValueFrom(api.uploadImage(file, 'tryon'))).id).toBe('media');
    expect(fetchMock).toHaveBeenCalledWith(signed.uploadUrl, {
      method: 'PUT', body: file, headers: signed.requiredHeaders, credentials: 'omit',
      redirect: 'error', signal: expect.any(AbortSignal),
    });
    expect(post).not.toHaveBeenCalled();
  });

  it.each(['network', 'http403'])(
    'uses the authenticated same-origin API after a %s failure, then finalizes', async (failure) => {
      vi.stubGlobal('fetch', failure === 'network' ? vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
        : vi.fn().mockResolvedValue(new Response('', { status: 403 })));
      const result = await firstValueFrom(api.uploadImage(file, 'tryon'));
      const [url, body] = post.mock.calls[0] as unknown as [string, FormData];
      expect(url).toBe('/api/v1/storage/upload');
      expect(body.get('objectKey')).toBe(signed.objectKey);
      expect((body.get('file') as File).size).toBe(file.size);
      expect(body.has('uploadUrl')).toBe(false);
      expect(api.finalizeUpload).toHaveBeenCalledWith({ objectKey: signed.objectKey });
      expect(result.id).toBe('media');
    },
  );

  it('finalizes an already uploaded object after a create-once 412 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 412 })));
    await firstValueFrom(api.uploadImage(file, 'tryon'));
    expect(post).not.toHaveBeenCalled();
    expect(api.finalizeUpload).toHaveBeenCalledOnce();
  });

  it('does not mark an upload ready when fallback fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    post.mockReturnValueOnce(throwError(() => new Error('Storage unavailable')));
    await expect(firstValueFrom(api.uploadImage(file, 'tryon'))).rejects.toThrow('Storage unavailable');
    expect(api.finalizeUpload).not.toHaveBeenCalled();
  });

  it('switches to the API when the direct connection times out', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'TimeoutError')));
    })));
    const result = firstValueFrom(api.uploadImage(file, 'tryon'));
    controller.abort();
    expect((await result).id).toBe('media');
    expect(post).toHaveBeenCalledOnce();
    expect(api.finalizeUpload).toHaveBeenCalledOnce();
  });

  it('does not retry the PUT when image validation fails during finalize', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })));
    vi.mocked(api.finalizeUpload).mockReturnValueOnce(throwError(() => new Error('Invalid image')));
    await expect(firstValueFrom(api.uploadImage(file, 'tryon'))).rejects.toThrow('Invalid image');
    expect(post).not.toHaveBeenCalled();
  });
});
