import { randomUUID } from "node:crypto";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
  type ContainerClient,
} from "@azure/storage-blob";

import { config } from "@/features/config";

export interface UploadDescriptor {
  method: "PUT" | "POST";
  url: string;
  headers?: Record<string, string>;
  fields?: Record<string, string>;
}

export interface FileStorage {
  /** Describe how the browser should upload a file for `key`. */
  createUploadDescriptor(opts: {
    key: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<UploadDescriptor>;
  /** Short-lived URL the browser can use to download/view the file. */
  getDownloadUrl(key: string): Promise<string>;
  /** Download the raw bytes server-side (used by OCR). */
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Build a storage key that is namespaced per member certification. */
export function buildStorageKey(memberCertificationId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  return `${memberCertificationId}/${randomUUID()}-${safeName}`;
}

class AzureBlobStorage implements FileStorage {
  private containerClient: ContainerClient;

  constructor() {
    const account = process.env.AZURE_STORAGE_ACCOUNT_NAME ?? "";
    const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY ?? "";
    const container = process.env.AZURE_STORAGE_CONTAINER_NAME ?? "certificates";

    const credential = new StorageSharedKeyCredential(account, accountKey);
    const serviceClient = new BlobServiceClient(
      `https://${account}.blob.core.windows.net`,
      credential
    );
    this.containerClient = serviceClient.getContainerClient(container);
  }

  private sasUrl(blobName: string, permissions: string, minutes: number): string {
    const account = process.env.AZURE_STORAGE_ACCOUNT_NAME ?? "";
    const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY ?? "";
    const credential = new StorageSharedKeyCredential(account, accountKey);
    const now = new Date();
    const expiry = new Date(now.getTime() + minutes * 60 * 1000);
    const sas = generateBlobSASQueryParameters(
      {
        containerName: this.containerClient.containerName,
        blobName,
        permissions: BlobSASPermissions.parse(permissions),
        startsOn: now,
        expiresOn: expiry,
        protocol: SASProtocol.HttpsAndHttp,
      },
      credential
    ).toString();
    return `${this.containerClient.getBlockBlobClient(blobName).url}?${sas}`;
  }

  async createUploadDescriptor(opts: {
    key: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<UploadDescriptor> {
    return {
      method: "PUT",
      url: this.sasUrl(opts.key, "cw", 15),
      headers: {
        "Content-Type": opts.contentType,
        "x-ms-blob-type": "BlockBlob",
      },
    };
  }

  async getDownloadUrl(key: string): Promise<string> {
    return this.sasUrl(key, "r", 15);
  }

  async download(key: string): Promise<Buffer> {
    const blob = this.containerClient.getBlockBlobClient(key);
    return blob.downloadToBuffer();
  }

  async delete(key: string): Promise<void> {
    await this.containerClient.deleteBlob(key, { deleteSnapshots: "include" }).catch(() => {
      // Ignore missing blobs.
    });
  }
}

class LocalFileStorage implements FileStorage {
  private baseDir = process.env.LOCAL_UPLOAD_DIR ?? "./storage/uploads";

  async createUploadDescriptor(opts: {
    key: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<UploadDescriptor> {
    return {
      method: "POST",
      url: "/api/files/local-upload",
      fields: { key: opts.key },
    };
  }

  async getDownloadUrl(key: string): Promise<string> {
    return `/api/files/blob/${encodeURIComponent(key)}`;
  }

  async download(key: string): Promise<Buffer> {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const full = path.join(this.baseDir, key);
    return fs.readFile(full);
  }

  async delete(key: string): Promise<void> {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const full = path.join(this.baseDir, key);
    await fs.unlink(full).catch(() => {
      // Ignore missing files.
    });
  }
}

let cached: FileStorage | null = null;

export function getFileStorage(): FileStorage {
  if (cached) return cached;
  cached = config.fileStorage === "azure" ? new AzureBlobStorage() : new LocalFileStorage();
  return cached;
}