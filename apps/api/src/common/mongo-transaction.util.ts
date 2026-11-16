import { ServiceUnavailableException } from '@nestjs/common';
import type { Connection, ClientSession } from 'mongoose';

function isTransactionUnsupported(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('replica set') || message.includes('transaction numbers');
}

export async function withCommerceTransaction<T>(
  connection: Connection,
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await connection.startSession();
  try {
    let result!: T;
    try {
      await session.withTransaction(async () => {
        result = await fn(session);
      });
    } catch (error) {
      if (isTransactionUnsupported(error)) {
        throw new ServiceUnavailableException(
          'MongoDB replica set is required for transactions. Configure MONGODB_URI with replicaSet=rs0.',
        );
      }
      throw error;
    }
    return result;
  } finally {
    await session.endSession();
  }
}
