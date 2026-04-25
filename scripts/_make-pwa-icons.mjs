import sharp from "sharp";
import path from "node:path";

const SRC = "/opt/nexus/public/images/cetix-transparent-emblem.png";
const OUT = "/opt/nexus/public";

// Fond des icônes PWA — blanc. Identité Cetix : logo bleu sur fond clair.
const BG = { r: 255, g: 255, b: 255, alpha: 1 };

async function makeIcon(size, name, { padded = true, bg = null } = {}) {
  const inner = Math.round(size * 0.72); // ~14% padding each side
  const emblem = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const base = bg
    ? sharp({
        create: { width: size, height: size, channels: 4, background: bg },
      })
    : sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      });

  const offset = Math.floor((size - inner) / 2);
  await base
    .composite([{ input: emblem, top: offset, left: offset }])
    .png()
    .toFile(path.join(OUT, name));
  console.log(`wrote ${name} (${size}x${size})`);
}

// Standard icons (transparent background — modern Android adaptive)
await makeIcon(192, "icon-192.png", { padded: true });
await makeIcon(512, "icon-512.png", { padded: true });

// Maskable icons (full-bleed background — required for adaptive icons on Android)
await makeIcon(192, "icon-maskable-192.png", { padded: true, bg: BG });
await makeIcon(512, "icon-maskable-512.png", { padded: true, bg: BG });

// Apple touch icon (iOS clips its own corners; needs solid background)
await makeIcon(180, "apple-touch-icon.png", { padded: true, bg: BG });
