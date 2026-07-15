/**
 * Pluggable byte-blob storage used to stage a package's media files between
 * read and write (ADR-0018).
 *
 * The default implementation is chosen per platform: Node uses a disk-backed
 * store in a temporary directory (large decks never sit fully in memory),
 * browsers use {@link InMemoryMediaStorage}. Callers with special needs (e.g.
 * an OPFS-backed store in a browser handling huge decks) can implement the
 * interface themselves and pass an instance via the package options.
 *
 * A storage instance is owned by a single package — sharing one instance
 * between packages would collide keys.
 */
export interface MediaStorage {
  /**
   * Stores bytes under an opaque key, replacing any existing value.
   * @param key - The storage key
   * @param data - The bytes to store (copied or persisted; the caller keeps ownership)
   */
  write: (key: string, data: Uint8Array) => Promise<void>;

  /**
   * Reads the bytes stored under a key.
   * @param key - The storage key
   * @returns The stored bytes
   * @throws {Error} when the key does not exist or cannot be read
   */
  read: (key: string) => Promise<Uint8Array>;

  /**
   * Returns the size in bytes of a stored value without materializing it.
   * @param key - The storage key
   * @returns The size in bytes
   * @throws {Error} when the key does not exist
   */
  size: (key: string) => Promise<number>;

  /**
   * Deletes the value stored under a key.
   * @param key - The storage key
   * @throws {Error} when the key does not exist or cannot be deleted
   */
  delete: (key: string) => Promise<void>;

  /**
   * Releases all backing resources. Idempotent; the store must not be used
   * afterwards.
   */
  dispose: () => Promise<void>;
}

/**
 * Memory-backed {@link MediaStorage}: the portable default for browsers, and
 * an option for Node callers who prefer to avoid temp files. All stored
 * content lives in RAM until {@link dispose}.
 */
export class InMemoryMediaStorage implements MediaStorage {
  private entries = new Map<string, Uint8Array>();

  public async write(key: string, data: Uint8Array): Promise<void> {
    // Copy so later mutation of the caller's buffer cannot change the store.
    this.entries.set(key, Uint8Array.from(data));
    return await Promise.resolve();
  }

  public async read(key: string): Promise<Uint8Array> {
    const data = this.entries.get(key);
    if (data === undefined) {
      throw new Error(`No stored content for key '${key}'`);
    }
    return await Promise.resolve(Uint8Array.from(data));
  }

  public async size(key: string): Promise<number> {
    const data = this.entries.get(key);
    if (data === undefined) {
      throw new Error(`No stored content for key '${key}'`);
    }
    return await Promise.resolve(data.length);
  }

  public async delete(key: string): Promise<void> {
    if (!this.entries.delete(key)) {
      throw new Error(`No stored content for key '${key}'`);
    }
    return await Promise.resolve();
  }

  public async dispose(): Promise<void> {
    this.entries.clear();
    return await Promise.resolve();
  }
}
