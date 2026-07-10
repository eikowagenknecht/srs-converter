import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { ConversionIssue } from "./error-handling";

/**
 * File-backed store for a package's media files.
 *
 * Mirrors the media handling of `AnkiPackage`: each file is written to disk
 * under a sequential numeric id inside a temporary directory owned by the store,
 * and an in-memory mapping from that id to the caller-facing filename is kept.
 * Filenames are used verbatim (arbitrary Unicode is allowed), which is why the
 * on-disk name is a numeric id rather than the filename itself.
 *
 * The directory is created lazily on the first {@link addMediaFile} call, so a
 * package that never holds media never touches the filesystem and
 * {@link cleanup} is a no-op.
 */
export class MediaStore {
  private tempDir: string | undefined;
  private mediaFiles: Record<number, string> = {};

  /**
   * Lists the filenames of every media file in the store.
   * @returns The media filenames
   */
  public listMediaFiles(): string[] {
    return Object.values(this.mediaFiles);
  }

  /**
   * Opens a media file for reading.
   * @param filename - The media filename to read
   * @returns A readable stream of the file's bytes
   * @throws {Error} if no media file with that name exists
   */
  public getMediaFile(filename: string): Readable {
    const mediaId = this.findMediaId(filename);
    if (mediaId === undefined) {
      throw new Error(`Media file '${filename}' not found in package`);
    }
    return createReadStream(join(this.requireTempDir(), mediaId));
  }

  /**
   * Returns the size in bytes of a stored media file.
   * @param filename - The media filename
   * @returns The file size in bytes
   * @throws {Error} if no media file with that name exists or it cannot be read
   */
  public async getMediaFileSize(filename: string): Promise<number> {
    const mediaId = this.findMediaId(filename);
    if (mediaId === undefined) {
      throw new Error(`Media file '${filename}' not found in package`);
    }
    try {
      const stats = await stat(join(this.requireTempDir(), mediaId));
      return stats.size;
    } catch (error) {
      throw new Error(
        `Failed to get size for media file '${filename}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Adds a media file to the store. The content is copied into the store's
   * temporary directory, so the caller retains ownership of `source`.
   * @param filename - The name to store the media under (used verbatim, may be Unicode)
   * @param source - The media content as a file path, Buffer, or readable stream
   * @throws {Error} if a media file with that name already exists
   * @throws {Error} if the source cannot be read or written
   */
  public async addMediaFile(filename: string, source: string | Buffer | Readable): Promise<void> {
    if (this.findMediaId(filename) !== undefined) {
      throw new Error(`Media file '${filename}' already exists in package`);
    }

    const existingIds = Object.keys(this.mediaFiles).map((id) => Math.trunc(Number(id)));
    const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 0;

    const targetPath = join(await this.ensureTempDir(), nextId.toFixed(0));

    try {
      if (typeof source === "string") {
        await copyFile(source, targetPath);
      } else if (Buffer.isBuffer(source)) {
        await writeFile(targetPath, source);
      } else {
        await pipeline(source, createWriteStream(targetPath));
      }
      this.mediaFiles[nextId] = filename;
    } catch (error) {
      throw new Error(
        `Failed to add media file '${filename}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Removes a media file from the store and deletes its backing file.
   * @param filename - The media filename to remove
   * @throws {Error} if no media file with that name exists
   * @throws {Error} if the backing file cannot be deleted
   */
  public async removeMediaFile(filename: string): Promise<void> {
    const mediaId = this.findMediaId(filename);
    if (mediaId === undefined) {
      throw new Error(`Media file '${filename}' does not exist in package`);
    }

    const numericId = Math.trunc(Number(mediaId));
    try {
      await rm(join(this.requireTempDir(), mediaId));
      this.mediaFiles = Object.fromEntries(
        Object.entries(this.mediaFiles).filter(([key]) => Math.trunc(Number(key)) !== numericId),
      );
    } catch (error) {
      throw new Error(
        `Failed to remove media file '${filename}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Removes the temporary directory backing the store. Safe to call when no
   * media was ever added (a no-op).
   * @returns Any warnings raised while removing the directory
   */
  public async cleanup(): Promise<ConversionIssue[]> {
    if (this.tempDir === undefined) {
      return [];
    }

    const issues: ConversionIssue[] = [];
    try {
      await rm(this.tempDir, { recursive: true });
      this.tempDir = undefined;
      this.mediaFiles = {};
    } catch (error) {
      issues.push({
        context: { originalData: error },
        message:
          "Could not clean up temporary media files. This does not affect your converted data.",
        severity: "warning",
      });
    }
    return issues;
  }

  /**
   * Finds the on-disk numeric id (as a string) for a filename.
   * @param filename - The media filename
   * @returns The numeric id, or undefined when the filename is not stored
   */
  private findMediaId(filename: string): string | undefined {
    return Object.entries(this.mediaFiles).find(([, name]) => name === filename)?.[0];
  }

  private async ensureTempDir(): Promise<string> {
    this.tempDir ??= await mkdtemp(join(tmpdir(), "srsconverter-media-"));
    return this.tempDir;
  }

  private requireTempDir(): string {
    if (this.tempDir === undefined) {
      // Unreachable in practice: every code path that needs the directory first
      // resolves a media id, which only exists once addMediaFile created it.
      throw new Error("No media files have been added to this package");
    }
    return this.tempDir;
  }
}
