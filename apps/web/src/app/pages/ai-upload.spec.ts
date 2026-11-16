import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../services/api.service';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { AiTryOnPage } from './ai-try-on.page';
import { AiMixMatchPage } from './ai-mix-match.page';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each([AiTryOnPage, AiMixMatchPage])('AI image upload recovery: %s', (Page) => {
  function fixture() {
    vi.stubGlobal('FileReader', class {
      result = 'data:image/png;base64,fixture';
      onload?: (event: unknown) => void;
      readAsDataURL() { this.onload?.({ target: this }); }
    });
    const uploadImage = vi.fn();
    const injector = Injector.create({ providers: [
      { provide: ApiService, useValue: { uploadImage } },
      { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
      { provide: CartService, useValue: {} },
      { provide: ActivatedRoute, useValue: {} },
    ] });
    const page = runInInjectionContext(injector, () => new Page());
    const select = (file: File) => {
      const input = { files: [file], value: file.name };
      page.onFileSelected({ target: input } as unknown as Event);
      return input;
    };
    return { page, uploadImage, select };
  }

  it('allows retrying the same file after a failure without reselecting it', () => {
    const { page, uploadImage, select } = fixture();
    const file = new File(['test'], 'photo.png', { type: 'image/png' });
    uploadImage.mockReturnValueOnce(throwError(() => new Error('Upload failed')))
      .mockReturnValueOnce(of({ id: 'ready' }));
    expect(select(file).value).toBe('');
    expect(page.uploadError()).toBe('Upload failed');
    expect(page.uploadedMediaId()).toBe('');
    page.retryUpload();
    expect(uploadImage).toHaveBeenNthCalledWith(2, file, 'tryon');
    expect(page.uploadError()).toBe('');
    expect(page.uploadedMediaId()).toBe('ready');
    expect(page.uploading()).toBe(false);
    page.ngOnDestroy();
  });

  it('ignores an older upload after another photo is selected', () => {
    const { page, uploadImage, select } = fixture();
    const first = new Subject<{ id: string }>();
    const second = new Subject<{ id: string }>();
    uploadImage.mockReturnValueOnce(first).mockReturnValueOnce(second);
    select(new File(['first'], 'first.png', { type: 'image/png' }));
    select(new File(['second'], 'second.png', { type: 'image/png' }));
    expect(first.observed).toBe(false);
    second.next({ id: 'second' });
    first.next({ id: 'first' });
    expect(page.uploadedMediaId()).toBe('second');
    page.ngOnDestroy();
  });

  it('cancels pending work when leaving the page', () => {
    const { page, uploadImage, select } = fixture();
    const pending = new Subject<{ id: string }>();
    uploadImage.mockReturnValue(pending);
    select(new File(['test'], 'photo.png', { type: 'image/png' }));
    page.ngOnDestroy();
    expect(pending.observed).toBe(false);
  });
});
