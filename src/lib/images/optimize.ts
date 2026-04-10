import sharp from "sharp";

// ---------------------------------------------------------------------------
// Image optimization presets
// ---------------------------------------------------------------------------

export interface OptimizeOptions {
  /** Max width in pixels. Height auto-scaled to keep aspect ratio. */
  maxWidth: number;
  /** Max height in pixels. */
  maxHeight: number;
  /** Output quality (1-100). Default 80. */
  quality?: number;
  /** Output format. Default "webp". */
  format?: "webp" | "png" | "jpeg";
}

/** Preset for org logos displayed in lists, tiles, kanban cards, sidebar. */
export const PRESET_LOGO: OptimizeOptions = {
  maxWidth: 256,
  maxHeight: 256,
  quality: 82,
  format: "webp",
};

/** Preset for user avatars in topbar, comments, ticket assignments. */
export const PRESET_AVATAR: OptimizeOptions = {
  maxWidth: 192,
  maxHeight: 192,
  quality: 80,
  format: "webp",
};

/** Preset for portal branding logo (displayed larger in portal header). */
export const PRESET_BRANDING: OptimizeOptions = {
  maxWidth: 400,
  maxHeight: 200,
  quality: 85,
  format: "webp",
};

// ---------------------------------------------------------------------------
// Core optimizer
// ---------------------------------------------------------------------------

/**
 * Optimize an image buffer: resize, convert to WebP, strip metadata.
 * Returns { buffer, mimeType, originalSize, optimizedSize }.
 */
export async function optimizeImage(
  input: Buffer,
  opts: OptimizeOptions = PRESET_LOGO,
): Promise<{
  buffer: Buffer;
  mimeType: string;
  originalSize: number;
  optimizedSize: number;
}> {
  const format = opts.format ?? "webp";
  const quality = opts.quality ?? 80;

  let pipeline = sharp(input)
    .rotate() // auto-rotate from EXIF
    .resize({
      width: opts.maxWidth,
      height: opts.maxHeight,
      fit: "inside",
      withoutEnlargement: true, // don't upscale small images
    });

  switch (format) {
    case "webp":
      pipeline = pipeline.webp({ quality, effort: 4 });
      break;
    case "png":
      pipeline = pipeline.png({ quality, compressionLevel: 8 });
      break;
    case "jpeg":
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      break;
  }

  const outputBuffer = await pipeline.toBuffer();

  const mimeMap = { webp: "image/webp", png: "image/png", jpeg: "image/jpeg" };

  return {
    buffer: outputBuffer,
    mimeType: mimeMap[format],
    originalSize: input.length,
    optimizedSize: outputBuffer.length,
  };
}

/**
 * Optimize and return as a data URI string ready for DB storage.
 */
export async function optimizeToDataUri(
  input: Buffer,
  opts: OptimizeOptions = PRESET_LOGO,
): Promise<{ dataUri: string; originalSize: number; optimizedSize: number }> {
  const result = await optimizeImage(input, opts);
  return {
    dataUri: `data:${result.mimeType};base64,${result.buffer.toString("base64")}`,
    originalSize: result.originalSize,
    optimizedSize: result.optimizedSize,
  };
}
