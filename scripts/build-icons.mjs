/**
 * PWA icons from the brand sources in public/icons.
 *
 *   node scripts/build-icons.mjs
 *
 * "any" icons come from the white icon; "maskable" ones from the flat teal
 * icon, shrunk into the central 80 % safe zone so Android's circle or squircle
 * mask never cuts the logo. Sources are 246 px: the 512 px icons are upscaled
 * and will be slightly soft until a larger (or vector) source replaces them.
 */
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
// sharp ships with Next.js; resolve it from there rather than adding a dependency.
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next")] }))

const dir = fileURLToPath(new URL("../public/icons/", import.meta.url))
const plain = `${dir}source-icon.png`
const flat = `${dir}source-icon-flat.png`


const meta = await sharp(flat).metadata()
const TRIM = { left: 3, top: 3, width: meta.width - 6, height: meta.height - 6 }
const { data } = await sharp(flat).extract({ left: 8, top: 8, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
const teal = { r: data[0], g: data[1], b: data[2], alpha: 1 }

for (const size of [192, 512]) {
  await sharp(plain)
    .resize(size, size, { kernel: "lanczos3" })
    .flatten({ background: "#ffffff" })
    .png()
    .toFile(`${dir}icon-${size}.png`)

  // The flat source has a lighter anti-aliased rim: crop it off, then sit
  // the logo on its own background colour, sampled from inside the rim.
  const inner = Math.round(size * 0.8)
  const logo = await sharp(flat).extract(TRIM).resize(inner, inner, { kernel: "lanczos3" }).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: teal } })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(`${dir}maskable-${size}.png`)
}

console.log(`icons written to ${dir}`)
