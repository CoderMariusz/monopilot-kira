import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import type pg from 'pg';

import { getAppConnection } from '@monopilot/db/clients.js';

export type S3CompatibleStorageConfig = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
};

export type PersistDownloadableOptions = {
  orgId: string;
  generatedByUser: string;
  appVersion?: string;
  sessionToken?: string;
  db?: pg.Pool | pg.PoolClient;
  storage?: S3CompatibleStorageConfig;
  now?: () => Date;
  signedUrlExpiresInSeconds?: number;
};

export type PersistDownloadableResult = {
  rowId: string;
  filePath: string;
  signedUrl: string;
  expiresAt: Date;
};

type Queryable = {
  query: pg.Pool['query'];
};

const DEFAULT_EXPIRES_SECONDS = 24 * 60 * 60;
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function storageConfigFromEnv(): S3CompatibleStorageConfig {
  return {
    endpoint: requireEnv('BUILDER_OUTPUTS_S3_ENDPOINT'),
    bucket: requireEnv('BUILDER_OUTPUTS_S3_BUCKET'),
    region: process.env.BUILDER_OUTPUTS_S3_REGION ?? 'eu-west-1',
    accessKeyId: requireEnv('BUILDER_OUTPUTS_S3_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('BUILDER_OUTPUTS_S3_SECRET_ACCESS_KEY'),
    forcePathStyle: process.env.BUILDER_OUTPUTS_S3_FORCE_PATH_STYLE !== 'false',
  };
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function toDateStamp(date: Date): string {
  return toAmzDate(date).slice(0, 8);
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeS3Key(key: string): string {
  return key.split('/').map(encodePathSegment).join('/');
}

function timestampForPath(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, '').replace('Z', 'Z');
}

function objectUrl(config: S3CompatibleStorageConfig, key: string): URL {
  const endpoint = new URL(config.endpoint);
  const forcePathStyle = config.forcePathStyle ?? true;
  const encodedKey = encodeS3Key(key);

  if (forcePathStyle) {
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/${encodePathSegment(config.bucket)}/${encodedKey}`;
    return endpoint;
  }

  endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/${encodedKey}`;
  return endpoint;
}

function signingKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}

function presignGetUrl(config: S3CompatibleStorageConfig, key: string, now: Date, expiresSeconds: number): string {
  if (!Number.isInteger(expiresSeconds) || expiresSeconds <= 0 || expiresSeconds > 604800) {
    throw new Error('signedUrlExpiresInSeconds must be an integer from 1 to 604800');
  }

  const url = objectUrl(config, key);
  const amzDate = toAmzDate(now);
  const dateStamp = toDateStamp(now);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const signedHeaders = 'host';

  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  url.searchParams.set('X-Amz-Credential', `${config.accessKeyId}/${credentialScope}`);
  url.searchParams.set('X-Amz-Date', amzDate);
  url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
  url.searchParams.set('X-Amz-SignedHeaders', signedHeaders);

  const canonicalQuery = Array.from(url.searchParams.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${encodePathSegment(name)}=${encodePathSegment(value)}`)
    .join('&');
  const canonicalRequest = [
    'GET',
    url.pathname,
    canonicalQuery,
    `host:${url.host}\n`,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = createHmac('sha256', signingKey(config.secretAccessKey, dateStamp, config.region))
    .update(stringToSign, 'utf8')
    .digest('hex');
  url.searchParams.set('X-Amz-Signature', signature);

  return url.toString();
}

async function uploadObject(config: S3CompatibleStorageConfig, key: string, buffer: Buffer): Promise<void> {
  const response = await globalThis.fetch(objectUrl(config, key), {
    method: 'PUT',
    headers: {
      'content-type': XLSX_CONTENT_TYPE,
      'content-length': String(buffer.byteLength),
    },
    body: new Uint8Array(buffer),
  });

  if (!response.ok) {
    throw new Error(`Builder output upload failed with HTTP ${response.status}`);
  }
}

async function assertProductVisible(db: Queryable, productCode: string): Promise<void> {
  const result = await db.query<{ product_code: string }>(
    'select product_code from public.product where product_code = $1',
    [productCode],
  );
  if (result.rowCount !== 1) {
    throw new Error(`Product ${productCode} does not belong to current org`);
  }
}

async function insertOutputRow(
  db: Queryable,
  values: {
    rowId: string;
    orgId: string;
    productCode: string;
    filePath: string;
    generatedByUser: string;
    appVersion: string | null;
  },
): Promise<void> {
  await db.query(
    `
      insert into public.fa_builder_outputs
        (id, org_id, product_code, file_path, generated_by_user, app_version)
      values ($1, $2, $3, $4, $5, $6)
    `,
    [
      values.rowId,
      values.orgId,
      values.productCode,
      values.filePath,
      values.generatedByUser,
      values.appVersion,
    ],
  );
}

function isPool(db: pg.Pool | pg.PoolClient): db is pg.Pool {
  return typeof (db as pg.Pool).connect === 'function';
}

export async function persistDownloadable(
  productCode: string,
  buffer: Buffer,
  options: PersistDownloadableOptions,
): Promise<PersistDownloadableResult> {
  const now = options.now?.() ?? new Date();
  const storage = options.storage ?? storageConfigFromEnv();
  const expiresSeconds = options.signedUrlExpiresInSeconds ?? DEFAULT_EXPIRES_SECONDS;
  const db = options.db ?? getAppConnection();
  const ownsPool = !options.db;
  const rowId = randomUUID();
  const filePath = `org/${options.orgId}/builder/FA${productCode}-${timestampForPath(now)}.xlsx`;
  const signedUrl = presignGetUrl(storage, filePath, now, expiresSeconds);
  const expiresAt = new Date(now.getTime() + expiresSeconds * 1000);

  if (isPool(db)) {
    const client = await db.connect();
    try {
      await client.query('begin');
      if (options.sessionToken) {
        await client.query('select app.set_org_context($1::uuid, $2::uuid)', [
          options.sessionToken,
          options.orgId,
        ]);
      }
      await assertProductVisible(client, productCode);
      await uploadObject(storage, filePath, buffer);
      await insertOutputRow(client, {
        rowId,
        orgId: options.orgId,
        productCode,
        filePath,
        generatedByUser: options.generatedByUser,
        appVersion: options.appVersion ?? null,
      });
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
      if (ownsPool) {
        await db.end();
      }
    }
  } else {
    if (options.sessionToken) {
      await db.query('select app.set_org_context($1::uuid, $2::uuid)', [
        options.sessionToken,
        options.orgId,
      ]);
    }
    await assertProductVisible(db, productCode);
    await uploadObject(storage, filePath, buffer);
    await insertOutputRow(db, {
      rowId,
      orgId: options.orgId,
      productCode,
      filePath,
      generatedByUser: options.generatedByUser,
      appVersion: options.appVersion ?? null,
    });
  }

  return {
    rowId,
    filePath,
    signedUrl,
    expiresAt,
  };
}
