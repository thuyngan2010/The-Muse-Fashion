import { ServiceUnavailableException } from '@nestjs/common';
import { AppConfig } from '../../common/app-config.js';

export type SepayMerchantConfig = {
  webhookApiKey: string;
  bankBin: string;
  accountNumber: string;
  accountName: string;
};

export function readSepayConfig(): SepayMerchantConfig {
  const webhookApiKey = AppConfig.optional('SEPAY_WEBHOOK_API_KEY');
  const bankBin = AppConfig.optional('SEPAY_BANK_BIN');
  const accountNumber = AppConfig.optional('SEPAY_ACCOUNT_NUMBER');
  const accountName = AppConfig.optional('SEPAY_ACCOUNT_NAME');
  if (!webhookApiKey || !bankBin || !accountNumber || !accountName) {
    throw new ServiceUnavailableException('SePay merchant configuration is incomplete');
  }
  return { webhookApiKey, bankBin, accountNumber, accountName };
}
