import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AppConfig } from '../../common/app-config.js';
import { readGpmpayConfig } from './gpmpay.config.js';
import { readSepayConfig } from './sepay.config.js';

export type PaymentProvider = 'GPMPAY' | 'SEPAY';

export function readPaymentProvider(): PaymentProvider {
  const provider = AppConfig.optional('PAYMENT_PROVIDER') ?? 'GPMPAY';
  if (provider !== 'GPMPAY' && provider !== 'SEPAY') {
    throw new ServiceUnavailableException('PAYMENT_PROVIDER must be GPMPAY or SEPAY');
  }
  return provider;
}

export function assertActivePaymentProvider(provider: PaymentProvider): void {
  if (readPaymentProvider() !== provider) throw new NotFoundException('Payment webhook not active');
}

export function assertPaymentProviderConfigured(): void {
  if (readPaymentProvider() === 'GPMPAY') readGpmpayConfig();
  else readSepayConfig();
}
