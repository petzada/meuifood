import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  type MenuImageContentType,
  publicMenuImageUrl,
} from "./menu-images.js";

export type MenuImageStorage = {
  createPresignedUpload(input: {
    contentLength: number;
    contentType: MenuImageContentType;
    objectKey: string;
  }): Promise<{ publicUrl: string; uploadUrl: string }>;
  deleteObject(objectKey: string): Promise<void>;
};

export type MenuImageStorageConfig = {
  accessKeyId: string;
  accountId: string;
  bucket: string;
  publicBaseUrl: string;
  secretAccessKey: string;
};

export function createMenuImageStorage(
  config: MenuImageStorageConfig,
): MenuImageStorage {
  const client = new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    region: "auto",
  });

  return {
    async createPresignedUpload({ contentLength, contentType, objectKey }) {
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        ContentLength: contentLength,
        ContentType: contentType,
        Key: objectKey,
      });
      const uploadUrl = await getSignedUrl(client, command, { expiresIn: 600 });
      return {
        publicUrl: publicMenuImageUrl(config.publicBaseUrl, objectKey),
        uploadUrl,
      };
    },
    async deleteObject(objectKey) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: objectKey,
        }),
      );
    },
  };
}

export function menuImageStorageFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): MenuImageStorage | null {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET?.trim();
  const publicBaseUrl = env.R2_PUBLIC_BASE_URL?.trim();
  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !publicBaseUrl
  ) {
    return null;
  }
  return createMenuImageStorage({
    accessKeyId,
    accountId,
    bucket,
    publicBaseUrl,
    secretAccessKey,
  });
}
