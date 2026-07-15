import { platform } from "#platform";

import type { ConversionIssue } from "./error-handling";
import type { MediaStorage } from "./storage";

/**
 * Store for a package's media files.
 *
 * Content is kept in a {@link MediaStorage} backend under a sequential
 * numeric id, and an in-memory mapping from that id to the caller-facing
 * filename is kept here. Filenames are used verbatim (arbitrary Unicode is
 * allowed), which is why the storage key is a numeric id rather than the
 * filename itself.
 *
 * The default backend is platform-specific (disk-backed temp directory on
 * Node, in-memory in browsers); see ADR-0018. The store owns its backend:
 * {@link cleanup} disposes it.
 */
export class MediaStore {
  private readonly storage: MediaStorage;
  private mediaFiles: Record<number, string> = {};

  constructor(storage: MediaStorage = platform.createDefaultMediaStorage()) {
    this.storage = storage;
  }

  /**
   * Lists the filenames of every media file in the store.
   * @returns The media filenames
   */
  public listMediaFiles(): string[] {
    return Object.values(this.mediaFiles);
  }

  /**
   * Lists every media file as an id/filename pair. Ids are the stable
   * numeric identifiers used inside Anki packages (zip entry names).
   * @returns The id/filename pairs
   */
  public getMediaEntries(): [id: number, filename: string][] {
    return Object.entries(this.mediaFiles).map(([id, filename]) => [
      Math.trunc(Number(id)),
      filename,
    ]);
  }

  /**
   * Retrieves the content of a media file.
   * @param filename - The media filename to read
   * @returns The media file's bytes
   * @throws {Error} if no media file with that name exists or it cannot be read
   */
  public async getMediaFile(filename: string): Promise<Uint8Array> {
    const mediaId = this.findMediaId(filename);
    if (mediaId === undefined) {
      throw new Error(`Media file '${filename}' not found in package`);
    }
    try {
      return await this.storage.read(mediaId);
    } catch (error) {
      throw new Error(
        `Failed to read media file '${filename}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
      return await this.storage.size(mediaId);
    } catch (error) {
      throw new Error(
        `Failed to get size for media file '${filename}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Adds a media file to the store. The content is copied into the backing
   * storage, so the caller retains ownership of `data`.
   * @param filename - The name to store the media under (used verbatim, may be Unicode)
   * @param data - The content of the media file
   * @throws {Error} if a media file with that name already exists
   * @throws {Error} if the content cannot be stored
   */
  public async addMediaFile(filename: string, data: Uint8Array): Promise<void> {
    if (this.findMediaId(filename) !== undefined) {
      throw new Error(`Media file '${filename}' already exists in package`);
    }

    const existingIds = Object.keys(this.mediaFiles).map((id) => Math.trunc(Number(id)));
    const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 0;

    try {
      await this.storage.write(nextId.toFixed(0), data);
      this.mediaFiles[nextId] = filename;
    } catch (error) {
      throw new Error(
        `Failed to add media file '${filename}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Stores a media file under a fixed numeric id, preserving the ids a
   * package was read with (they may be non-contiguous). Intended for package
   * readers; regular callers should use {@link addMediaFile}.
   * @param id - The numeric media id from the package
   * @param filename - The filename from the package's media mapping
   * @param data - The content of the media file
   * @throws {Error} if the id or filename is already present
   */
  public async restoreMediaFile(id: number, filename: string, data: Uint8Array): Promise<void> {
    if (id in this.mediaFiles) {
      throw new Error(`Media id ${id.toFixed(0)} already exists in package`);
    }
    if (this.findMediaId(filename) !== undefined) {
      throw new Error(`Media file '${filename}' already exists in package`);
    }
    await this.storage.write(id.toFixed(0), data);
    this.mediaFiles[id] = filename;
  }

  /**
   * Removes a media file from the store and deletes its backing content.
   * @param filename - The media filename to remove
   * @throws {Error} if no media file with that name exists
   * @throws {Error} if the backing content cannot be deleted
   */
  public async removeMediaFile(filename: string): Promise<void> {
    const mediaId = this.findMediaId(filename);
    if (mediaId === undefined) {
      throw new Error(`Media file '${filename}' does not exist in package`);
    }

    const numericId = Math.trunc(Number(mediaId));
    try {
      await this.storage.delete(mediaId);
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
   * Disposes the storage backing the store. Safe to call when no media was
   * ever added.
   * @returns Any warnings raised while disposing the storage
   */
  public async cleanup(): Promise<ConversionIssue[]> {
    const issues: ConversionIssue[] = [];
    try {
      await this.storage.dispose();
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
   * Finds the storage key (stringified numeric id) for a filename.
   * @param filename - The media filename
   * @returns The numeric id as a string, or undefined when not stored
   */
  private findMediaId(filename: string): string | undefined {
    return Object.entries(this.mediaFiles).find(([, name]) => name === filename)?.[0];
  }
}
