import crypto from "node:crypto";
import path from "node:path";
import { AppError } from "./errors.js";
import { parseJson } from "./json.js";

export const MAX_ARTIFACT_UNCOMPRESSED_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ARTIFACT_FILES = 50;

export const FORBIDDEN_EXECUTABLE_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".sh",
  ".bat",
  ".cmd",
  ".msi",
  ".com",
  ".scr",
  ".dylib",
  ".so",
  ".bin",
  ".elf",
]);

export type RawArtifactFileInput = {
  path: string;
  content: string;
  encoding?: "utf8" | "base64";
  isSymlink?: boolean;
};

export type ArtifactDeliverableInput = {
  files?: RawArtifactFileInput[];
  patchText?: string | null;
  archiveUrl?: string | null;
  fallbackAnswerText?: string | null;
};

export type CanonicalFileManifestEntry = {
  path: string;
  sha256: string;
  sizeBytes: number;
};

export type CanonicalArtifactFile = CanonicalFileManifestEntry & {
  content: string;
};

export type ValidatedArtifactBundle = {
  sha256Digest: string;
  manifest: CanonicalFileManifestEntry[];
  files: CanonicalArtifactFile[];
  patchText: string | null;
  archiveUrl: string | null;
  totalSizeBytes: number;
  fileCount: number;
};

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Validates an untrusted relative file path from a code submission or archive.
 * Rejects path traversal (`..`), leading slashes (`/`, `\`), Windows drive letters (`C:\`),
 * null bytes, and forbidden executable extensions.
 */
export function validateArtifactFilePath(rawPath: string): string {
  if (typeof rawPath !== "string") {
    throw new AppError(400, "ARTIFACT_INVALID_PATH", "Artifact file path must be a string.");
  }

  const trimmed = rawPath.trim();
  if (!trimmed || trimmed.length > 512) {
    throw new AppError(400, "ARTIFACT_INVALID_PATH", "Artifact file path must be between 1 and 512 characters.");
  }

  if (trimmed.includes("\0") || /[\x00-\x1f]/.test(trimmed)) {
    throw new AppError(400, "ARTIFACT_INVALID_PATH", "Artifact file path contains invalid control characters.");
  }

  // Reject absolute paths (POSIX `/` or Windows `\`) and Windows drive letters (`C:\` or `C:/`)
  if (trimmed.startsWith("/") || trimmed.startsWith("\\") || /^[A-Za-z]:/.test(trimmed)) {
    throw new AppError(
      400,
      "ARTIFACT_PATH_TRAVERSAL",
      `Path traversal or absolute path rejected: "${rawPath}". All artifact paths must be safe relative paths.`,
      { path: rawPath, quarantined: true },
    );
  }

  // Split on both `/` and `\` to catch mixed-separator traversal such as `src\..\..\evil.js`
  const segments = trimmed.split(/[\\/]+/);
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") {
      throw new AppError(
        400,
        "ARTIFACT_PATH_TRAVERSAL",
        `Path traversal segment rejected in "${rawPath}". Relative parent segments ("..") are forbidden.`,
        { path: rawPath, quarantined: true },
      );
    }
  }

  const normalized = segments.join("/");
  const ext = path.posix.extname(normalized).toLowerCase();
  if (ext && FORBIDDEN_EXECUTABLE_EXTENSIONS.has(ext)) {
    throw new AppError(
      400,
      "ARTIFACT_FORBIDDEN_EXECUTABLE",
      `Executable or binary extension "${ext}" in "${normalized}" is not allowed in code artifacts.`,
      { path: normalized, extension: ext, quarantined: true },
    );
  }

  return normalized;
}

function validatePatchPaths(patchText: string): void {
  const lines = patchText.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      const target = line.slice(4).trim().split(/\t|\s+/)[0];
      if (!target || target === "/dev/null") continue;
      const stripped = target.startsWith("a/") || target.startsWith("b/") ? target.slice(2) : target;
      validateArtifactFilePath(stripped);
    } else if (line.startsWith("diff --git ")) {
      const parts = line.slice("diff --git ".length).trim().split(/\s+/);
      for (const part of parts) {
        const stripped = part.startsWith("a/") || part.startsWith("b/") ? part.slice(2) : part;
        if (stripped && stripped !== "/dev/null") {
          validateArtifactFilePath(stripped);
        }
      }
    }
  }
}

function decodeAndCheckContent(file: RawArtifactFileInput, normalizedPath: string): { text: string; bytes: Buffer } {
  if (file.isSymlink) {
    throw new AppError(
      400,
      "ARTIFACT_SYMLINK_FORBIDDEN",
      `Symbolic links are forbidden in code artifacts ("${normalizedPath}").`,
      { path: normalizedPath, quarantined: true },
    );
  }

  if (typeof file.content !== "string") {
    throw new AppError(400, "ARTIFACT_INVALID_CONTENT", `Content for "${normalizedPath}" must be a string.`);
  }

  const bytes =
    file.encoding === "base64" ? Buffer.from(file.content, "base64") : Buffer.from(file.content, "utf8");

  // Detect ELF (`\x7fELF`) or PE/MZ (`MZ\x90\x00`) binary executables disguised with source extensions
  if (
    (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) ||
    (bytes.length >= 4 && bytes[0] === 0x4d && bytes[1] === 0x5a && bytes[2] === 0x90 && bytes[3] === 0x00)
  ) {
    throw new AppError(
      400,
      "ARTIFACT_FORBIDDEN_EXECUTABLE",
      `Binary executable payload detected in "${normalizedPath}".`,
      { path: normalizedPath, quarantined: true },
    );
  }

  return {
    text: bytes.toString("utf8"),
    bytes,
  };
}

/**
 * Validates all files and patch content against path traversal, symlink, executable extension,
 * file count (max 50), and uncompressed size (max 5 MB) limits, and computes a deterministic,
 * byte-reproducible SHA-256 digest over the canonicalized artifact bundle.
 */
export function validateAndCanonicalizeArtifact(input: ArtifactDeliverableInput): ValidatedArtifactBundle {
  const rawFiles = input.files ?? [];
  if (rawFiles.length > MAX_ARTIFACT_FILES) {
    throw new AppError(
      400,
      "ARTIFACT_FILE_LIMIT_EXCEEDED",
      `Artifact contains ${rawFiles.length} files, exceeding the maximum of ${MAX_ARTIFACT_FILES} files.`,
      { fileCount: rawFiles.length, maxFiles: MAX_ARTIFACT_FILES, quarantined: true },
    );
  }

  const patchText =
    input.patchText && input.patchText.trim().length > 0 ? input.patchText.replace(/\r\n/g, "\n") : null;
  const archiveUrl = input.archiveUrl && input.archiveUrl.trim().length > 0 ? input.archiveUrl.trim() : null;

  if (archiveUrl) {
    const parsedUrl = new URL(archiveUrl);
    const ext = path.posix.extname(parsedUrl.pathname).toLowerCase();
    if (ext && FORBIDDEN_EXECUTABLE_EXTENSIONS.has(ext)) {
      throw new AppError(
        400,
        "ARTIFACT_FORBIDDEN_EXECUTABLE",
        `Archive URL points to a forbidden executable extension "${ext}".`,
        { archiveUrl, quarantined: true },
      );
    }
  }

  if (patchText) {
    validatePatchPaths(patchText);
  }

  let totalSizeBytes = patchText ? Buffer.byteLength(patchText, "utf8") : 0;
  if (totalSizeBytes > MAX_ARTIFACT_UNCOMPRESSED_BYTES) {
    throw new AppError(
      400,
      "ARTIFACT_SIZE_LIMIT_EXCEEDED",
      `Patch size (${totalSizeBytes} bytes) exceeds the 5 MB uncompressed limit.`,
      { totalSizeBytes, maxBytes: MAX_ARTIFACT_UNCOMPRESSED_BYTES, quarantined: true },
    );
  }

  const seenPaths = new Set<string>();
  const canonicalFiles: CanonicalArtifactFile[] = [];

  for (const rawFile of rawFiles) {
    const normalizedPath = validateArtifactFilePath(rawFile.path);
    if (seenPaths.has(normalizedPath)) {
      throw new AppError(
        400,
        "ARTIFACT_DUPLICATE_PATH",
        `Duplicate file path "${normalizedPath}" in artifact submission.`,
        { path: normalizedPath },
      );
    }
    seenPaths.add(normalizedPath);

    const { text, bytes } = decodeAndCheckContent(rawFile, normalizedPath);
    totalSizeBytes += bytes.byteLength;

    if (totalSizeBytes > MAX_ARTIFACT_UNCOMPRESSED_BYTES) {
      throw new AppError(
        400,
        "ARTIFACT_SIZE_LIMIT_EXCEEDED",
        `Total uncompressed artifact size (${totalSizeBytes} bytes) exceeds the 5 MB limit (${MAX_ARTIFACT_UNCOMPRESSED_BYTES} bytes).`,
        { totalSizeBytes, maxBytes: MAX_ARTIFACT_UNCOMPRESSED_BYTES, quarantined: true },
      );
    }

    canonicalFiles.push({
      path: normalizedPath,
      content: text,
      sha256: sha256Hex(bytes),
      sizeBytes: bytes.byteLength,
    });
  }

  // If no explicit files or patchText were supplied, synthesize a canonical deliverable file
  // from fallbackAnswerText so plain-text submissions also receive an immutable SHA-256 artifact record.
  if (canonicalFiles.length === 0 && !patchText && input.fallbackAnswerText) {
    const fallbackBytes = Buffer.from(input.fallbackAnswerText, "utf8");
    totalSizeBytes += fallbackBytes.byteLength;
    canonicalFiles.push({
      path: "DELIVERABLE.md",
      content: input.fallbackAnswerText,
      sha256: sha256Hex(fallbackBytes),
      sizeBytes: fallbackBytes.byteLength,
    });
  }

  // Sort lexicographically by canonical path so SHA-256 is order-independent and reproducible
  canonicalFiles.sort((a, b) => a.path.localeCompare(b.path));

  const manifest: CanonicalFileManifestEntry[] = canonicalFiles.map(({ path: filePath, sha256, sizeBytes }) => ({
    path: filePath,
    sha256,
    sizeBytes,
  }));

  const canonicalEnvelope = JSON.stringify({
    schemaVersion: "1.0",
    files: manifest,
    patchSha256: patchText ? sha256Hex(Buffer.from(patchText, "utf8")) : null,
    archiveUrl: archiveUrl ?? null,
  });

  const sha256Digest = sha256Hex(canonicalEnvelope);

  return {
    sha256Digest,
    manifest,
    files: canonicalFiles,
    patchText,
    archiveUrl,
    totalSizeBytes,
    fileCount: canonicalFiles.length,
  };
}

export function serializeSubmissionArtifact(artifact: {
  id: string;
  taskId: string;
  submissionId: string;
  version: number;
  sha256Digest: string;
  fileManifestJson: string;
  filesJson: string;
  patchText: string | null;
  archiveUrl: string | null;
  totalSizeBytes: number;
  fileCount: number;
  isQuarantined: boolean;
  invalidatedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: artifact.id,
    taskId: artifact.taskId,
    submissionId: artifact.submissionId,
    version: artifact.version,
    sha256Digest: artifact.sha256Digest,
    fileManifest: parseJson<CanonicalFileManifestEntry[]>(artifact.fileManifestJson, []),
    files: parseJson<CanonicalArtifactFile[]>(artifact.filesJson, []),
    patchText: artifact.patchText,
    archiveUrl: artifact.archiveUrl,
    totalSizeBytes: artifact.totalSizeBytes,
    fileCount: artifact.fileCount,
    isQuarantined: artifact.isQuarantined,
    invalidated: Boolean(artifact.invalidatedAt),
    invalidatedAt: artifact.invalidatedAt ? artifact.invalidatedAt.toISOString() : null,
    createdAt: artifact.createdAt.toISOString(),
  };
}
