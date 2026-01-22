import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { AnkiPackage } from "./anki-package";
import { createTestAnkiNote, expectSuccess, setupTempDir } from "./anki-package.fixtures";
import { basicModel } from "./constants";

setupTempDir();

describe("Media File APIs", () => {
  const MEDIA_PACKAGE_PATH = "tests/fixtures/anki/mixed-legacy-2.apkg";
  const EXPECTED_FILENAME = "paste-ab21b25dd3e4ba4af2a1d8bdfa4c47455e53abac.jpg";

  describe("listMediaFiles()", () => {
    it("should return list of media filenames", async () => {
      const result = await AnkiPackage.fromAnkiExport(MEDIA_PACKAGE_PATH);
      const pkg = expectSuccess(result);

      try {
        const mediaFiles = pkg.listMediaFiles();

        expect(mediaFiles).toBeInstanceOf(Array);
        expect(mediaFiles).toContain(EXPECTED_FILENAME);
        expect(mediaFiles).toHaveLength(1);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should return empty array for package with no media", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        const mediaFiles = pkg.listMediaFiles();

        expect(mediaFiles).toBeInstanceOf(Array);
        expect(mediaFiles).toHaveLength(0);
      } finally {
        await pkg.cleanup();
      }
    });
  });

  describe("getMediaFileSize()", () => {
    it("should return correct size for existing media file", async () => {
      const result = await AnkiPackage.fromAnkiExport(MEDIA_PACKAGE_PATH);
      const pkg = expectSuccess(result);

      try {
        const size = await pkg.getMediaFileSize(EXPECTED_FILENAME);

        expect(size).toBe(10_701); // Known size from the test file
      } finally {
        await pkg.cleanup();
      }
    });

    it("should throw error for non-existent media file", async () => {
      const result = await AnkiPackage.fromAnkiExport(MEDIA_PACKAGE_PATH);
      const pkg = expectSuccess(result);

      try {
        await expect(pkg.getMediaFileSize("non-existent-file.jpg")).rejects.toThrow(
          "Media file 'non-existent-file.jpg' not found in package",
        );
      } finally {
        await pkg.cleanup();
      }
    });
  });

  describe("getMediaFile()", () => {
    it("should return ReadableStream for media file", async () => {
      const result = await AnkiPackage.fromAnkiExport(MEDIA_PACKAGE_PATH);
      const pkg = expectSuccess(result);

      try {
        const stream = pkg.getMediaFile(EXPECTED_FILENAME);

        // Read the stream into memory to verify content
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk as Buffer);
        }

        const buffer = Buffer.concat(chunks);
        expect(buffer.length).toBe(10_701); // Known size

        // Verify it's a valid JPEG by checking magic bytes
        expect(buffer[0]).toBe(0xff);
        expect(buffer[1]).toBe(0xd8);
        expect(buffer[2]).toBe(0xff);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should throw error for non-existent media file", async () => {
      const result = await AnkiPackage.fromAnkiExport(MEDIA_PACKAGE_PATH);
      const pkg = expectSuccess(result);

      try {
        expect(() => pkg.getMediaFile("non-existent-file.jpg")).toThrow(
          "Media file 'non-existent-file.jpg' not found in package",
        );
      } finally {
        await pkg.cleanup();
      }
    });
  });

  describe("addMediaFile()", () => {
    const TEST_IMAGE_PATH = "tests/fixtures/media/image.png";
    const TEST_IMAGE_NAME = "test-image.png";

    it("should add media file from file path", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add the media file
        await pkg.addMediaFile(TEST_IMAGE_NAME, TEST_IMAGE_PATH);

        // Verify it's in the list
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toContain(TEST_IMAGE_NAME);
        expect(mediaFiles).toHaveLength(1);

        // Verify we can retrieve it (test image is 21053 bytes)
        const size = await pkg.getMediaFileSize(TEST_IMAGE_NAME);
        expect(size).toBe(21_053);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should add media file from Buffer", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        const buffer = Buffer.from("test content");
        await pkg.addMediaFile("test-buffer.txt", buffer);

        // Verify it's in the list
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toContain("test-buffer.txt");

        // Verify content is correct
        const stream = pkg.getMediaFile("test-buffer.txt");
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk as Buffer);
        }
        const retrievedBuffer = Buffer.concat(chunks);
        expect(retrievedBuffer.toString()).toBe("test content");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should add media file from Readable stream", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        const { createReadStream } = await import("node:fs");
        const stream = createReadStream(TEST_IMAGE_PATH);
        await pkg.addMediaFile("stream-image.png", stream);

        // Verify it's in the list
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toContain("stream-image.png");

        // Verify size matches original
        const size = await pkg.getMediaFileSize("stream-image.png");
        const { stat } = await import("node:fs/promises");
        const originalStats = await stat(TEST_IMAGE_PATH);
        expect(size).toBe(originalStats.size);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should throw error when adding duplicate filename", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        const buffer = Buffer.from("content");
        await pkg.addMediaFile("duplicate.txt", buffer);

        // Try to add the same filename again
        await expect(pkg.addMediaFile("duplicate.txt", buffer)).rejects.toThrow(
          "Media file 'duplicate.txt' already exists in package",
        );
      } finally {
        await pkg.cleanup();
      }
    });

    it("should throw error for non-existent source file path", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await expect(pkg.addMediaFile("test.txt", "/non/existent/path.txt")).rejects.toThrow(
          "Failed to add media file 'test.txt'",
        );
      } finally {
        await pkg.cleanup();
      }
    });

    it("should generate sequential media IDs", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add three files
        await pkg.addMediaFile("file1.txt", Buffer.from("content1"));
        await pkg.addMediaFile("file2.txt", Buffer.from("content2"));
        await pkg.addMediaFile("file3.txt", Buffer.from("content3"));

        // All three should be in the list
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(3);
        expect(mediaFiles).toContain("file1.txt");
        expect(mediaFiles).toContain("file2.txt");
        expect(mediaFiles).toContain("file3.txt");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should include added media files in exported package", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add a media file
        await pkg.addMediaFile(TEST_IMAGE_NAME, TEST_IMAGE_PATH);

        // Export to file
        const exportPath = "out/test-with-added-media.apkg";
        await pkg.toAnkiExport(exportPath);

        // Re-read the exported package
        const reimportResult = await AnkiPackage.fromAnkiExport(exportPath);
        const reimportedPkg = expectSuccess(reimportResult);

        try {
          // Verify media file is present
          const mediaFiles = reimportedPkg.listMediaFiles();
          expect(mediaFiles).toContain(TEST_IMAGE_NAME);

          // Verify content matches
          const originalStats = await (await import("node:fs/promises")).stat(TEST_IMAGE_PATH);
          const reimportedSize = await reimportedPkg.getMediaFileSize(TEST_IMAGE_NAME);
          expect(reimportedSize).toBe(originalStats.size);
        } finally {
          await reimportedPkg.cleanup();
        }
      } finally {
        await pkg.cleanup();
      }
    });

    it("should work with packages that already have media", async () => {
      const result = await AnkiPackage.fromAnkiExport(MEDIA_PACKAGE_PATH);
      const pkg = expectSuccess(result);

      try {
        // Package already has one media file
        const initialFiles = pkg.listMediaFiles();
        expect(initialFiles).toHaveLength(1);

        // Add another media file
        await pkg.addMediaFile("new-file.txt", Buffer.from("new content"));

        // Now should have two
        const updatedFiles = pkg.listMediaFiles();
        expect(updatedFiles).toHaveLength(2);
        expect(updatedFiles).toContain(EXPECTED_FILENAME); // Original
        expect(updatedFiles).toContain("new-file.txt"); // New
      } finally {
        await pkg.cleanup();
      }
    });
  });

  describe("removeMediaFile()", () => {
    const TEST_IMAGE_PATH = "tests/fixtures/media/image.png";
    const TEST_IMAGE_NAME = "test-image.png";

    it("should remove an existing media file", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add a media file
        await pkg.addMediaFile(TEST_IMAGE_NAME, TEST_IMAGE_PATH);

        // Verify it's there
        let mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toContain(TEST_IMAGE_NAME);
        expect(mediaFiles).toHaveLength(1);

        // Remove it
        await pkg.removeMediaFile(TEST_IMAGE_NAME);

        // Verify it's gone
        mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).not.toContain(TEST_IMAGE_NAME);
        expect(mediaFiles).toHaveLength(0);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should throw error when removing non-existent file", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await expect(pkg.removeMediaFile("non-existent.png")).rejects.toThrow(
          "Media file 'non-existent.png' does not exist in package",
        );
      } finally {
        await pkg.cleanup();
      }
    });

    it("should remove file from disk", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add a media file
        await pkg.addMediaFile(TEST_IMAGE_NAME, TEST_IMAGE_PATH);

        // Verify we can access it (test image is 21053 bytes)
        const size = await pkg.getMediaFileSize(TEST_IMAGE_NAME);
        expect(size).toBe(21_053);

        // Remove it
        await pkg.removeMediaFile(TEST_IMAGE_NAME);

        // Verify we can't access it anymore
        await expect(pkg.getMediaFileSize(TEST_IMAGE_NAME)).rejects.toThrow(
          "Media file 'test-image.png' not found in package",
        );
      } finally {
        await pkg.cleanup();
      }
    });

    it("should not include removed files in exported package", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add two media files
        await pkg.addMediaFile(TEST_IMAGE_NAME, TEST_IMAGE_PATH);
        await pkg.addMediaFile("keep-this.txt", Buffer.from("keep this content"));

        // Remove one
        await pkg.removeMediaFile(TEST_IMAGE_NAME);

        // Export to file
        const exportPath = "out/test-with-removed-media.apkg";
        await pkg.toAnkiExport(exportPath);

        // Re-read the exported package
        const reimportResult = await AnkiPackage.fromAnkiExport(exportPath);
        const reimportedPkg = expectSuccess(reimportResult);

        try {
          // Verify only the kept file is present
          const mediaFiles = reimportedPkg.listMediaFiles();
          expect(mediaFiles).toHaveLength(1);
          expect(mediaFiles).toContain("keep-this.txt");
          expect(mediaFiles).not.toContain(TEST_IMAGE_NAME);
        } finally {
          await reimportedPkg.cleanup();
        }
      } finally {
        await pkg.cleanup();
      }
    });

    it("should work with packages loaded from file", async () => {
      const result = await AnkiPackage.fromAnkiExport(MEDIA_PACKAGE_PATH);
      const pkg = expectSuccess(result);

      try {
        // Package already has one media file
        const initialFiles = pkg.listMediaFiles();
        expect(initialFiles).toHaveLength(1);
        expect(initialFiles).toContain(EXPECTED_FILENAME);

        // Remove the existing media file
        await pkg.removeMediaFile(EXPECTED_FILENAME);

        // Verify it's gone
        const updatedFiles = pkg.listMediaFiles();
        expect(updatedFiles).toHaveLength(0);
        expect(updatedFiles).not.toContain(EXPECTED_FILENAME);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should remove multiple files correctly", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add three files
        await pkg.addMediaFile("file1.txt", Buffer.from("content1"));
        await pkg.addMediaFile("file2.txt", Buffer.from("content2"));
        await pkg.addMediaFile("file3.txt", Buffer.from("content3"));

        // Verify all are present
        let mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(3);

        // Remove file2
        await pkg.removeMediaFile("file2.txt");

        // Verify only file2 is gone
        mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(2);
        expect(mediaFiles).toContain("file1.txt");
        expect(mediaFiles).not.toContain("file2.txt");
        expect(mediaFiles).toContain("file3.txt");

        // Remove file1
        await pkg.removeMediaFile("file1.txt");

        // Verify only file3 remains
        mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(1);
        expect(mediaFiles).toContain("file3.txt");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should throw error when trying to remove same file twice", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add a file
        await pkg.addMediaFile(TEST_IMAGE_NAME, TEST_IMAGE_PATH);

        // Remove it once (should succeed)
        await pkg.removeMediaFile(TEST_IMAGE_NAME);

        // Try to remove again (should fail)
        await expect(pkg.removeMediaFile(TEST_IMAGE_NAME)).rejects.toThrow(
          "Media file 'test-image.png' does not exist in package",
        );
      } finally {
        await pkg.cleanup();
      }
    });

    it("should handle removal and re-adding of same filename", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add a file
        await pkg.addMediaFile(TEST_IMAGE_NAME, TEST_IMAGE_PATH);
        const originalSize = await pkg.getMediaFileSize(TEST_IMAGE_NAME);

        // Remove it
        await pkg.removeMediaFile(TEST_IMAGE_NAME);

        // Add a different file with the same name
        const newContent = Buffer.from("new content with same name");
        await pkg.addMediaFile(TEST_IMAGE_NAME, newContent);

        // Verify the new file is present
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toContain(TEST_IMAGE_NAME);

        // Verify the content is different (size changed)
        const newSize = await pkg.getMediaFileSize(TEST_IMAGE_NAME);
        expect(newSize).toBe(newContent.length);
        expect(newSize).not.toBe(originalSize);
      } finally {
        await pkg.cleanup();
      }
    });
  });

  describe("removeUnreferencedMediaFiles()", () => {
    const TEST_IMAGE_PATH = "tests/fixtures/media/image.png";
    const TEST_AUDIO_PATH = "tests/fixtures/media/audio.mp3";
    const TEST_VIDEO_PATH = "tests/fixtures/media/video.mp4"; // Anki uses [sound:] for video too

    it("should remove unreferenced media files", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Add media files
        await pkg.addMediaFile("referenced-image.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("unreferenced.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("referenced-sound.mp3", TEST_AUDIO_PATH);

        // Add a note that references some media
        pkg.addNote(
          createTestAnkiNote({
            fields: ['<img src="referenced-image.png">', "[sound:referenced-sound.mp3]"],
            noteTypeId: basicModel.id,
          }),
        );

        // Verify all files are present
        let mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(3);

        // Remove unreferenced files
        const removed = await pkg.removeUnreferencedMediaFiles();

        // Verify only the unreferenced file was removed
        expect(removed).toEqual(["unreferenced.png"]);
        mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(2);
        expect(mediaFiles).toContain("referenced-image.png");
        expect(mediaFiles).toContain("referenced-sound.mp3");
        expect(mediaFiles).not.toContain("unreferenced.png");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should keep files referenced in img tags with various formats", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await pkg.addMediaFile("with-quotes.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("without-quotes.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("single-quotes.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("unreferenced.png", TEST_IMAGE_PATH);

        // Add notes with different img tag formats
        pkg.addNote(
          createTestAnkiNote({
            fields: ['<img src="with-quotes.png">', "Back"],
            noteTypeId: basicModel.id,
          }),
        );
        pkg.addNote(
          createTestAnkiNote({
            fields: ["<img src=without-quotes.png>", "Back"],
            noteTypeId: basicModel.id,
          }),
        );
        pkg.addNote(
          createTestAnkiNote({
            fields: ["<img src='single-quotes.png'>", "Back"],
            noteTypeId: basicModel.id,
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toEqual(["unreferenced.png"]);
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(3);
        expect(mediaFiles).toContain("with-quotes.png");
        expect(mediaFiles).toContain("without-quotes.png");
        expect(mediaFiles).toContain("single-quotes.png");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should keep files referenced in sound tags", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await pkg.addMediaFile("audio1.mp3", TEST_AUDIO_PATH);
        await pkg.addMediaFile("audio2.mp3", TEST_AUDIO_PATH);
        await pkg.addMediaFile("unreferenced.mp3", TEST_AUDIO_PATH);

        pkg.addNote(
          createTestAnkiNote({
            fields: ["Front", "[sound:audio1.mp3] [sound:audio2.mp3]"],
            noteTypeId: basicModel.id,
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toEqual(["unreferenced.mp3"]);
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(2);
        expect(mediaFiles).toContain("audio1.mp3");
        expect(mediaFiles).toContain("audio2.mp3");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should keep video files referenced via sound tags (Anki uses [sound:] for video)", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await pkg.addMediaFile("video1.mp4", TEST_VIDEO_PATH);
        await pkg.addMediaFile("video2.mp4", TEST_VIDEO_PATH);
        await pkg.addMediaFile("unreferenced.mp4", TEST_VIDEO_PATH);

        // Anki uses [sound:] syntax for both audio and video files
        pkg.addNote(
          createTestAnkiNote({
            fields: ["Front", "[sound:video1.mp4] [sound:video2.mp4]"],
            noteTypeId: basicModel.id,
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toEqual(["unreferenced.mp4"]);
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(2);
        expect(mediaFiles).toContain("video1.mp4");
        expect(mediaFiles).toContain("video2.mp4");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should return empty array when no unreferenced files exist", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await pkg.addMediaFile("referenced.png", TEST_IMAGE_PATH);

        pkg.addNote(
          createTestAnkiNote({
            fields: ['<img src="referenced.png">', "Back"],
            noteTypeId: basicModel.id,
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toEqual([]);
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(1);
        expect(mediaFiles).toContain("referenced.png");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should remove all files when no notes reference media", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await pkg.addMediaFile("file1.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("file2.mp3", TEST_AUDIO_PATH);
        await pkg.addMediaFile("file3.png", TEST_IMAGE_PATH);

        pkg.addNote(
          createTestAnkiNote({
            fields: ["Front without media", "Back without media"],
            noteTypeId: basicModel.id,
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toHaveLength(3);
        expect(removed).toContain("file1.png");
        expect(removed).toContain("file2.mp3");
        expect(removed).toContain("file3.png");
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(0);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should handle packages with no media files", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        pkg.addNote(
          createTestAnkiNote({
            fields: ["Front", "Back"],
            noteTypeId: basicModel.id,
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toEqual([]);
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(0);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should scan all note fields for references", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await pkg.addMediaFile("in-field1.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("in-field2.mp3", TEST_AUDIO_PATH);
        await pkg.addMediaFile("unreferenced.png", TEST_IMAGE_PATH);

        // Note with media in different fields
        pkg.addNote(
          createTestAnkiNote({
            fields: ['<img src="in-field1.png">', "[sound:in-field2.mp3]"],
            noteTypeId: basicModel.id,
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toEqual(["unreferenced.png"]);
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(2);
        expect(mediaFiles).toContain("in-field1.png");
        expect(mediaFiles).toContain("in-field2.mp3");
      } finally {
        await pkg.cleanup();
      }
    });

    it("should handle complex HTML with multiple media references", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        await pkg.addMediaFile("img1.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("img2.png", TEST_IMAGE_PATH);
        await pkg.addMediaFile("sound1.mp3", TEST_AUDIO_PATH);
        await pkg.addMediaFile("unreferenced.png", TEST_IMAGE_PATH);

        pkg.addNote(
          createTestAnkiNote({
            fields: [
              '<div><img src="img1.png" alt="test"><img src="img2.png"></div>',
              "Text before [sound:sound1.mp3] text after",
            ],
            noteTypeId: basicModel.id,
          }),
        );

        const removed = await pkg.removeUnreferencedMediaFiles();

        expect(removed).toEqual(["unreferenced.png"]);
        const mediaFiles = pkg.listMediaFiles();
        expect(mediaFiles).toHaveLength(3);
      } finally {
        await pkg.cleanup();
      }
    });

    it("should throw error if database not available", async () => {
      const result = await AnkiPackage.fromDefault();
      const pkg = expectSuccess(result);

      try {
        // Clear the database contents to simulate unavailable database

        (pkg as unknown as { databaseContents: undefined }).databaseContents = undefined;

        await expect(pkg.removeUnreferencedMediaFiles()).rejects.toThrow(
          "Database contents not available",
        );
      } finally {
        // Note: cleanup would fail since we cleared databaseContents, but that's OK for this test
      }
    });
  });
});
