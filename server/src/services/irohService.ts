import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  AddrInfoOptions,
  BlobTicket,
  Iroh,
  ReadAtLenType,
  SetTagOption,
  AddProgressAllDone
} from '@number0/iroh';
import type { WrapOption } from '@number0/iroh';

export interface SharedBlobRecord {
  hash: string;
  name: string;
  size: number;
  compressedSize?: number;
  mimeType: string;
  owner?: string;
  createdAt: string;
  ticket: string;
  originalName?: string;
  originalSize?: number;
  originalType?: string;
  compression?: 'gzip' | 'none';
}

const sharedBlobs = new Map<string, SharedBlobRecord>();
let nodePromise: Promise<Iroh> | null = null;

function getDataDir(): string {
  const dir = path.join(os.tmpdir(), 'iroh-node-data');
  return dir;
}

async function getNode(): Promise<Iroh> {
  if (!nodePromise) {
    nodePromise = Iroh.persistent(getDataDir(), {
      enableDocs: false
    });
  }
  return nodePromise;
}

async function importFileFromPath(filePath: string): Promise<AddProgressAllDone> {
  const node = await getNode();
  const wrap: WrapOption = { wrap: false };

  return new Promise<AddProgressAllDone>((resolve, reject) => {
    node.blobs
      .addFromPath(filePath, false, SetTagOption.auto(), wrap, (err, progress) => {
        if (err) {
          reject(err);
          return;
        }

        if (progress?.allDone) {
          resolve(progress.allDone);
        }
      })
      .catch(reject);
  });
}

async function ensureBlobAvailable(ticket: BlobTicket): Promise<Iroh> {
  const node = await getNode();
  const hasBlob = await node.blobs.has(ticket.hash);

  if (!hasBlob) {
    await node.net.addNodeAddr(ticket.nodeAddr);
    await node.blobs.download(ticket.hash, ticket.asDownloadOptions(), () => undefined);
  }

  return node;
}

export async function shareFileFromPath(options: {
  filePath: string;
  originalName: string;
  mimeType: string;
  owner?: string;
  originalSize?: number;
  originalType?: string;
  compression?: 'gzip' | 'none';
}): Promise<SharedBlobRecord> {
  const { filePath, originalName, mimeType, owner, originalSize, originalType, compression } = options;
  const stats = await fs.stat(filePath);
  const addResult = await importFileFromPath(filePath);
  const node = await getNode();
  const ticket = await node.blobs.share(
    addResult.hash,
    addResult.format,
    AddrInfoOptions.RelayAndAddresses
  );

  const record: SharedBlobRecord = {
    hash: addResult.hash,
    name: originalName,
    size: originalSize ?? stats.size,
    compressedSize: stats.size,
    mimeType,
    owner,
    createdAt: new Date().toISOString(),
    ticket: ticket.toString(),
    originalName,
    originalSize: originalSize ?? stats.size,
    originalType: originalType ?? mimeType,
    compression: compression ?? 'none'
  };

  sharedBlobs.set(addResult.hash, record);
  return record;
}

export async function shareTextContent(options: {
  contents: string;
  owner?: string;
}): Promise<SharedBlobRecord> {
  const buffer = Buffer.from(options.contents, 'utf8');
  const node = await getNode();
  const outcome = await node.blobs.addBytesNamed(Array.from(buffer), 'shared-text.txt');
  const ticket = await node.blobs.share(
    outcome.hash,
    outcome.format,
    AddrInfoOptions.RelayAndAddresses
  );

  const record: SharedBlobRecord = {
    hash: outcome.hash,
    name: 'shared-text.txt',
    size: Number(outcome.size),
    compressedSize: buffer.byteLength,
    mimeType: 'text/plain',
    owner: options.owner,
    createdAt: new Date().toISOString(),
    ticket: ticket.toString(),
    originalName: 'shared-text.txt',
    originalSize: buffer.byteLength,
    originalType: 'text/plain',
    compression: 'none'
  };

  sharedBlobs.set(outcome.hash, record);
  return record;
}

export async function inspectTicket(ticketValue: string): Promise<SharedBlobRecord & { downloadUrlTicket: string }> {
  const ticket = BlobTicket.fromString(ticketValue.trim());
  const node = await ensureBlobAvailable(ticket);
  const stored = sharedBlobs.get(ticket.hash);

  if (stored) {
    return { ...stored, downloadUrlTicket: ticket.toString() };
  }

  const sizeBigInt = await node.blobs.size(ticket.hash);
  const fallback: SharedBlobRecord = {
    hash: ticket.hash,
    name: `${ticket.hash}.bin`,
    size: Number(sizeBigInt),
    compressedSize: Number(sizeBigInt),
    mimeType: 'application/octet-stream',
    createdAt: new Date().toISOString(),
    ticket: ticket.toString()
  };

  return { ...fallback, downloadUrlTicket: ticket.toString() };
}

export async function downloadBlob(ticketValue: string) {
  const ticket = BlobTicket.fromString(ticketValue.trim());
  const node = await ensureBlobAvailable(ticket);
  const bytes = await node.blobs.readToBytes(ticket.hash);
  const metadata = sharedBlobs.get(ticket.hash);

  return {
    buffer: Buffer.from(bytes),
    metadata,
    hash: ticket.hash
  };
}

export async function getBlobStream(ticketValue: string, chunkSize = 256 * 1024, range?: { start: number; end: number }) {
  const ticket = BlobTicket.fromString(ticketValue.trim());
  const node = await ensureBlobAvailable(ticket);
  const metadata = sharedBlobs.get(ticket.hash);
  const sizeBigInt = await node.blobs.size(ticket.hash);
  const size = Number(sizeBigInt);
  const startOffset = range ? Math.max(0, Math.min(range.start, size - 1)) : 0;
  const endOffset = range ? Math.min(range.end, size - 1) : size - 1;
  const startBigInt = BigInt(startOffset);
  const endBigInt = BigInt(endOffset);

  async function* chunkIterator() {
    let offset = startBigInt;
    const maxChunk = BigInt(chunkSize);

    while (offset <= endBigInt) {
      const remaining = endBigInt - offset + 1n;
      const len = remaining < maxChunk ? remaining : maxChunk;
      const bytes = await node.blobs.readAtToBytes(ticket.hash, offset, {
        type: ReadAtLenType.AtMost,
        size: len
      });

      if (!bytes.length) break;

      offset += BigInt(bytes.length);
      yield Buffer.from(bytes);
    }
  }

  return {
    metadata,
    hash: ticket.hash,
    size,
    range: {
      start: startOffset,
      end: endOffset
    },
    chunkIterator
  };
}

export async function getPreviewChunk(ticketValue: string, byteLength: number) {
  const ticket = BlobTicket.fromString(ticketValue.trim());
  const node = await ensureBlobAvailable(ticket);
  const bytes = await node.blobs.readAtToBytes(ticket.hash, 0n, {
    type: ReadAtLenType.AtMost,
    size: BigInt(byteLength)
  });

  const metadata = sharedBlobs.get(ticket.hash);
  const buffer = Buffer.from(bytes);
  const mimeType = metadata?.mimeType ?? 'application/octet-stream';
  const isText = mimeType.startsWith('text/') || metadata?.name?.endsWith('.md') || false;

  return {
    buffer,
    mimeType,
    isText,
    metadata
  };
}
