import { PutObjectCommand } from '@aws-sdk/client-s3';

import { s3Client } from '../clients.js';
import { BUCKET_NAME, deploymentSnapshotKey } from '../config.js';
import type { MappingConfig } from '../types.js';

export async function put(mappingId: string, environment: string, deployedAt: string, config: MappingConfig): Promise<string> {
  const key = deploymentSnapshotKey(mappingId, environment, deployedAt);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(config),
      ContentType: 'application/json',
    }),
  );

  return key;
}

export const deploymentSnapshot = {
  put,
};
