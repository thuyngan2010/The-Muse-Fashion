import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { postParagraphs, postTitle, readingMinutes } from './community-post.page';

describe('Community post detail page (Figma "Chi tiết Blog")', () => {
  it('uses the first caption line as headline and the rest as paragraphs', () => {
    const caption = 'Váy Cocktail Là Gì?\nĐoạn một dòng 1\ndòng 2\n\nĐoạn hai';
    expect(postTitle(caption)).toBe('Váy Cocktail Là Gì?');
    expect(postParagraphs(caption)).toEqual(['Đoạn một dòng 1\ndòng 2', 'Đoạn hai']);
    expect(postParagraphs('Chỉ có tiêu đề')).toEqual([]);
  });

  it('estimates reading time at 200 words per minute, at least 1 minute', () => {
    expect(readingMinutes('')).toBe(1);
    expect(readingMinutes(Array(401).fill('từ').join(' '))).toBe(3);
  });

  it('has its own route and the community list navigates to it instead of opening the old popup', () => {
    const routesSource = readFileSync(new URL('../app.routes.ts', import.meta.url), 'utf8');
    expect(routesSource).toContain("{ path: 'community/:postId', component: CommunityPostPage");
    const list = readFileSync(new URL('./community.page.ts', import.meta.url), 'utf8');
    expect(list).toContain("this.router.navigate(['/community', postId])");
    expect(list).not.toContain('Chi tiết bài viết"');
  });
});
