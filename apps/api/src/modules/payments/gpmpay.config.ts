import { ServiceUnavailableException } from '@nestjs/common';
import { AppConfig } from '../../common/app-config.js';

export type GpmpayMerchantConfig = {
  webhookSecret: string;
  bankBin: string;
  accountNumber: string;
  accountName: string;
  allowSimulated: boolean;
};

export function readGpmpayConfig(): GpmpayMerchantConfig {
  const webhookSecret = AppConfig.optional('GPMPAY_WEBHOOK_SECRET');
  const bankBin = AppConfig.optional('GPMPAY_BANK_BIN');
  const accountNumber = AppConfig.optional('GPMPAY_ACCOUNT_NUMBER');
  const accountName = AppConfig.optional('GPMPAY_ACCOUNT_NAME');
  if (!webhookSecret || !bankBin || !accountNumber || !accountName) {
    throw new ServiceUnavailableException('GPM Pay merchant configuration is incomplete');
  }
  const nodeEnv = AppConfig.optional('NODE_ENV') ?? 'development';
  return {
    webhookSecret,
    bankBin,
    accountNumber,
    accountName,
    allowSimulated: nodeEnv !== 'production',
  };
}

export function tryReadGpmpayConfig(): GpmpayMerchantConfig | null {
  try {
    return readGpmpayConfig();
  } catch {
    return null;
  }
}
