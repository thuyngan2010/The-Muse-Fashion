import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertActivePaymentProvider, assertPaymentProviderConfigured, readPaymentProvider } from './payment-provider.config.js';

afterEach(() => vi.unstubAllEnvs());

describe('active payment provider', () => {
  it('defaults to GPM Pay for existing deployments', () => {
    vi.stubEnv('PAYMENT_PROVIDER', '');
    expect(readPaymentProvider()).toBe('GPMPAY');
    expect(() => assertActivePaymentProvider('SEPAY')).toThrow();
  });

  it('activates only SePay when configured', () => {
    vi.stubEnv('PAYMENT_PROVIDER', 'SEPAY');
    expect(readPaymentProvider()).toBe('SEPAY');
    expect(() => assertActivePaymentProvider('GPMPAY')).toThrow();
  });

  it('rejects an unknown provider instead of falling back', () => {
    vi.stubEnv('PAYMENT_PROVIDER', 'OTHER');
    expect(() => readPaymentProvider()).toThrow();
  });

  it('requires only the active merchant configuration', () => {
    vi.stubEnv('PAYMENT_PROVIDER', 'SEPAY');
    vi.stubEnv('SEPAY_WEBHOOK_API_KEY', 'test-key');
    vi.stubEnv('SEPAY_BANK_BIN', '970422');
    vi.stubEnv('SEPAY_ACCOUNT_NUMBER', '123456789');
    vi.stubEnv('SEPAY_ACCOUNT_NAME', 'Test Merchant');
    vi.stubEnv('GPMPAY_WEBHOOK_SECRET', '');
    expect(() => assertPaymentProviderConfigured()).not.toThrow();
    vi.stubEnv('SEPAY_WEBHOOK_API_KEY', '');
    expect(() => assertPaymentProviderConfigured()).toThrow();
  });

  it('fails startup validation when the default GPM Pay configuration is incomplete', () => {
    vi.stubEnv('PAYMENT_PROVIDER', '');
    vi.stubEnv('GPMPAY_WEBHOOK_SECRET', '');
    expect(() => assertPaymentProviderConfigured()).toThrow();
    vi.stubEnv('GPMPAY_WEBHOOK_SECRET', 'test-secret');
    vi.stubEnv('GPMPAY_BANK_BIN', '970422');
    vi.stubEnv('GPMPAY_ACCOUNT_NUMBER', '123456789');
    vi.stubEnv('GPMPAY_ACCOUNT_NAME', 'Test Merchant');
    expect(() => assertPaymentProviderConfigured()).not.toThrow();
  });
});
