import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { MediaStorage } from "@/storage";

/**
 * Disk-backed {@link MediaStorage}: the Node default. Each key becomes a file
 * inside a temporary directory that is created lazily on the first write —
 * a package that never holds media never touches the filesystem — and
 * removed by {@link dispose}.
 *
 * Keys are used as filenames verbatim, which is safe because the library
 * only uses sequential numeric ids as keys.
 */
export class NodeFsMediaStorage implements MediaStorage {
  private tempDir: string | undefined;
  private disposed = false;

  public async write(key: string, data: Uint8Array): Promise<void> {
    this.requireUsable();
    const dir = await this.ensureTempDir();
    await writeFile(join(dir, key), data);
  }

  public async read(key: string): Promise<Uint8Array> {
    this.requireUsable();
    const filePath = join(this.requireTempDir(), key);
    return new Uint8Array(await readFile(filePath));
  }

  public async size(key: string): Promise<number> {
    this.requireUsable();
    const stats = await stat(join(this.requireTempDir(), key));
    return stats.size;
  }

  public async delete(key: string): Promise<void> {
    this.requireUsable();
    await rm(join(this.requireTempDir(), key));
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    if (this.tempDir === undefined) {
      return;
    }
    const dir = this.tempDir;
    this.tempDir = undefined;
    await rm(dir, { force: true, recursive: true });
  }

  private requireUsable(): void {
    if (this.disposed) {
      throw new Error("Media storage has been disposed");
    }
  }

  private async ensureTempDir(): Promise<string> {
    this.tempDir ??= await mkdtemp(join(tmpdir(), "srsconverter-media-"));
    return this.tempDir;
  }

  private requireTempDir(): string {
    if (this.tempDir === undefined) {
      throw new Error("No content has been stored yet");
    }
    return this.tempDir;
  }
}
