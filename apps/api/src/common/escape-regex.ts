/** Escape ký tự đặc biệt để chuỗi người dùng nhập dùng an toàn trong RegExp. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
