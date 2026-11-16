export class AppConfig {
  static require(name: string): string {
    const value = process.env[name];
    if (!value?.trim()) throw new Error(`Required environment variable is missing: ${name}`);
    return value;
  }
  static optional(name: string): string | undefined { return process.env[name]?.trim() || undefined; }

  static boolean(name: string, fallback = false): boolean {
    const value = this.optional(name);
    if (value === undefined) return fallback;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    throw new Error(`${name} must be true, false, 1, or 0`);
  }

  static csv(name: string, fallback: string[] = []): string[] {
    const value = this.optional(name);
    return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : fallback;
  }
}
