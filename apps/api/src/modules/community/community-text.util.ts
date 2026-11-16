import { BadRequestException } from '@nestjs/common';

const UNSAFE = /<script|javascript:|on\w+\s*=|<iframe|<object|<embed/i;

export function assertSafeCommunityText(field: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new BadRequestException(`${field} is required`);
  if (UNSAFE.test(trimmed) || /<[^>]+>/.test(trimmed)) {
    throw new BadRequestException(`${field} must not contain HTML or executable markup`);
  }
  return trimmed;
}
