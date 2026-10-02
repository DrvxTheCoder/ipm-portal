"use client"

import { useId, useMemo, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import QRCode from "qrcode"
import type { FamilyMember } from "@/lib/queries"

/**
 * La carte IPM, numérique — the card the IPM module prints, drawn from the same
 * artwork (senexus-multiapp `src/server/cards/templates/*.svg` and the slot
 * geometry in `card-core.ts`). Every path, coordinate, colour and size below is
 * the artwork's; only the slots are filled here, as the module does.
 *
 *   Recto: holder, photo, matricule, verification QR, coverage.
 *   Verso: the ayants droit grid — dependents have no card of their own.
 *
 * One addition to the printed artwork: the employer and the formule, under the
 * holder's name. The printed card leaves them off; on a phone they answer the
 * counter's first question.
 */

export type CardCoverage = { label: string; rate: number }

const W = 161.57
const H = 246.61
const CENTRE = W / 2
const FONT = "Montserrat, var(--font-sans)"

/* ---------- text fitting (card-core: emWidth / fitFontSize) ---------- */

const WIDE = new Set("MW@%".split(""))
const NARROW = new Set("iIljt.,;:'|!()[]{}/\\".split(""))

function emWidth(text: string): number {
  let em = 0
  for (const char of text) {
    if (char === " ") em += 0.29
    else if (char >= "0" && char <= "9") em += 0.6
    else if (WIDE.has(char)) em += 1.0
    else if (NARROW.has(char)) em += 0.3
    else if (char === char.toUpperCase() && char !== char.toLowerCase()) em += 0.74
    else em += 0.6
  }
  return em
}

function fitFontSize(text: string, maxWidth: number, preferred: number, min = 3): number {
  if (!text) return preferred
  if (emWidth(text) * preferred <= maxWidth) return preferred
  return Math.max(min, Math.floor((maxWidth / emWidth(text)) * 100) / 100)
}

function clamp(text: string, maxChars: number): string {
  const trimmed = text.trim()
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
}

/* ---------- lines (card-core) ---------- */

/** "DIOP Awa" — surname upper-cased, the way the artwork sets it. */
function holderName(firstName: string, lastName: string): string {
  return `${lastName.toUpperCase()} ${firstName}`.trim()
}

function birthLine(birthDate: string | null, female: boolean): string {
  if (!birthDate) return ""
  const [year, month, day] = birthDate.slice(0, 10).split("-")
  return `${female ? "née" : "né"} le ${day}/${month}/${year}`
}

function coverageLine(coverage: CardCoverage[]): string {
  if (!coverage.length) return ""
  return `Prise en charge ${coverage.map((c) => `${c.label} ${Math.round(c.rate * 100)}%`).join(" ")}`
}

/* ---------- geometry (card-core) ---------- */

const PHOTO = { cx: 80.79, cy: 75.89, r: 36.21 }
const QR = { originX: 56.92, originY: 173.29, module: 1.29, modules: 37, colour: "#028f9d" }
const DEPENDENT_BOXES = [
  { x: 15.93, y: 53.94, ty: 97.84 },
  { x: 61.49, y: 54.13, ty: 98.03 },
  { x: 107.05, y: 54.13, ty: 98.03 },
  { x: 15.93, y: 105.64, ty: 149.6 },
  { x: 61.49, y: 105.67, ty: 149.57 },
  { x: 107.05, y: 105.67, ty: 149.57 },
  { x: 15.93, y: 157.18, ty: 201.14 },
  { x: 61.49, y: 157.21, ty: 201.12 },
  { x: 107.05, y: 157.21, ty: 201.12 },
]
const BOX = { size: 39.73, radius: 3.1 }

/** A missing photo is a valid state: most of the register has none yet. */
function Silhouette({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g fill="#c9d6d8">
      <circle cx={cx} cy={cy - r * 0.28} r={r * 0.34} />
      <circle cx={cx} cy={cy + r * 0.72} r={r * 0.62} />
    </g>
  )
}

function QrModules({ value }: { value: string }) {
  const rects = useMemo(() => {
    const symbol = QRCode.create(value, { errorCorrectionLevel: "M" })
    const size = symbol.modules.size
    if (size > QR.modules) return []
    const offset = ((QR.modules - size) / 2) * QR.module
    const out: Array<{ x: number; y: number }> = []
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        if (symbol.modules.get(row, column)) {
          out.push({ x: QR.originX + offset + column * QR.module, y: QR.originY + offset + row * QR.module })
        }
      }
    }
    return out
  }, [value])
  return (
    <g fill={QR.colour} shapeRendering="crispEdges">
      {rects.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={QR.module} height={QR.module} />
      ))}
    </g>
  )
}

/* ---------- the two faces ---------- */

function Recto({
  holder,
  employerName,
  planName,
  coverage,
  qrValue,
  uid,
}: {
  holder: FamilyMember
  employerName: string
  planName: string | null
  coverage: CardCoverage[]
  qrValue: string
  uid: string
}) {
  const name = holderName(holder.person.firstName, holder.person.lastName)
  const label = "Matricule :"
  const labelWidth = emWidth(label) * 5
  const total = labelWidth + 1.6 + emWidth(holder.matricule) * 5
  const labelX = CENTRE - total / 2
  const employer = clamp(employerName, 40)
  const formule = planName ? `Formule ${planName}` : "Tarif employeur"

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="size-full -mt-3" fontFamily={FONT} fontWeight={700} role="img" aria-label={`Carte IPM de ${holder.name}`}>
      <defs>
        <clipPath id={`${uid}-photo`}>
          <circle cx={PHOTO.cx} cy={PHOTO.cy} r={PHOTO.r} />
        </clipPath>
      </defs>
      <rect fill="#fff" width={W} height={H} />

      {/* curved teal panel */}
      <rect fill="#057887" x="47.02" y="-.63" width="67.53" height="29.37" />
      <path fill="#057887" d="M51.24,38.46v-.02s.19-.15.57-.43c.42-.32.85-.63,1.28-.94C62.4,30.25,103.53.1,104.26-.63c.82-.82,56.62,0,56.62,0l.18,37.72c-.01,7.38-.03,14.77-.04,22.15-15.9,15.660-31.81,31.33-47.71,46.99-8.4,8.93-20.32,14.51-33.55,14.51-25.45,0-46.09-20.63-46.09-46.09,0-14.68,6.87-27.75,17.57-36.19Z" />
      <path fill="#028f9d" d="M125.9,74.65c0,25.45-20.63,46.09-46.08,46.090-13.23,0-25.15-5.580-33.55-14.51L.52,61.29l.03-18.95L.59-.55h54.71c13.04,9.670,43.84,32.25,51.18,37.62.43.31.87.62,1.28.94.39.28.58.42.58.42v.03c1.51,1.2,2.94,2.49,4.3,3.87,8.19,8.31,13.26,19.73,13.26,32.32Z" />

      {/* photo */}
      <g clipPath={`url(#${uid}-photo)`}>
        <circle cx={PHOTO.cx} cy={PHOTO.cy} r={PHOTO.r} fill="#eef3f4" />
        {holder.person.photoUrl ? (
          <image
            href={holder.person.photoUrl}
            x={PHOTO.cx - PHOTO.r}
            y={PHOTO.cy - PHOTO.r}
            width={PHOTO.r * 2}
            height={PHOTO.r * 2}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <Silhouette cx={PHOTO.cx} cy={PHOTO.cy} r={PHOTO.r} />
        )}
      </g>

      {/* logo */}
      <g fill="#fff">
        <polygon points="73.84 17.35 73.84 14.91 72.39 14.91 69.94 14.91 68.49 14.91 68.49 17.35 69.94 17.35 69.94 29.09 68.49 29.09 68.49 31.53 69.94 31.53 72.39 31.53 73.84 31.53 73.84 29.09 72.39 29.09 72.39 17.35 73.84 17.35" />
        <path d="M75.07,14.91h2.44c1.06,0,2.13.27,2.94,1.04.81.77,1.36,2.04,1.36,3.94s-.54,3.140-1.36,3.91c-.81.77-1.88,1.090-2.94,1.09v6.65h-2.44V14.91ZM77.51,22.39c.75,0,1.22-.14,1.49-.52.27-.36.34-.97.34-1.9s-.07-1.580-.34-1.99c-.27-.41-.75-.590-1.49-.59v5Z" />
        <path d="M87.08,31.53l-1.56-10.45-.09-.7h-.14v11.15h-2.26V14.91h2.99l1.45,7.6.11.88h.05l.11-.88,1.45-7.6h2.99v16.62h-2.26v-11.15h-.14l-.09.7-1.56,10.45h-1.04Z" />
        <path d="M69.46,32.95h-.96v-.57h2.63v.57h-.97v2.45h-.7v-2.45Z" />
        <path d="M73.33,34.75h-1.4l-.27.65h-.71l1.34-3.01h.69l1.35,3.01h-.73l-.27-.65ZM73.11,34.22l-.48-1.15-.48,1.15h.96Z" />
        <path d="M79.03,32.38l-.99,3.01h-.75l-.66-2.04-.68,2.04h-.74l-.99-3.01h.72l.68,2.12.71-2.12h.65l.69,2.14.7-2.14h.67Z" />
        <path d="M80.12,32.94v.8h1.4v.56h-1.4v1.1h-.7v-3.01h2.28v.56h-1.58Z" />
        <path d="M84.51,34.83v.56h-2.33v-3.01h2.28v.56h-1.58v.65h1.4v.54h-1.4v.7h1.64Z" />
        <path d="M85.06,32.38h.7v3.01h-.7v-3.01Z" />
        <path d="M87.57,34.21l-.4.42v.76h-.69v-3.01h.69v1.41l1.34-1.41h.78l-1.25,1.34,1.32,1.67h-.81l-.96-1.18Z" />
        <path d="M92.43,32.38v3.01h-.7v-1.24h-1.37v1.24h-.7v-3.01h.7v1.19h1.37v-1.19h.7Z" />
        <path d="M65.88,17.4c-1.19.07-2.19.5-2.47.63-.67.31-1,.49-1.44.53-.22.02-.44.01-.67-.02-.41-.06-.6.11-.6.52,0,.74,0,1.49,0,2.23.02,2.63,1.09,4.75,3.18,6.35.32.24.6.41.67.45.84.51,1.63.75,2.18.88,0-3.85,0-7.7,0-11.54-.18-.02-.48-.04-.84-.02ZM65.54,23.36h-1.05v1.05h-1.04v-1.05h-1.05v-1.04h1.05v-1.05h1.04v1.05h1.05v1.04Z" />
      </g>

      <text x={CENTRE} y={137.46} textAnchor="middle" fill="#028f9d" fontSize={fitFontSize(name, 114, 11, 5)}>
        {name}
      </text>

      {/* employer and formule — the portal's addition */}
      {/* <text x={CENTRE} y={148.4} textAnchor="middle" fill="#037383" fontSize={fitFontSize(employer, 120, 5, 3)} letterSpacing="-.02em">
        {employer}
      </text>
      <text x={CENTRE} y={154.6} textAnchor="middle" fill="#32a994" fontSize={4} letterSpacing="-.02em">
        {formule}
      </text> */}

      <text x={CENTRE} y={162.69} textAnchor="middle" fill="#37bb9f" fontSize={5} letterSpacing="-.02em">
        {birthLine(holder.person.birthDate, holder.person.gender === "FEMALE")}
      </text>
      <text x={labelX} y={170.53} fill="#37bb9f" fontSize={5} letterSpacing="-.02em">
        {label}
      </text>
      <text x={labelX + labelWidth + 1.6} y={170.53} fill="#057887" fontSize={5} letterSpacing="-.04em">
        {holder.matricule}
      </text>

      <QrModules value={qrValue} />

      <text x={CENTRE} y={226.69} textAnchor="middle" fill="#32a994" fontSize={4} letterSpacing="-.02em">
        {coverageLine(coverage)}
      </text>
      <text x={CENTRE} y={234.41} textAnchor="middle" fill="#037383" fontSize={5.43}>
        www.ipmtawfeikh.com
      </text>
    </svg>
  )
}

function Verso({ dependents, coverage, uid }: { dependents: FamilyMember[]; coverage: CardCoverage[]; uid: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="size-full" fontFamily={FONT} role="img" aria-label="Bénéficiaires de la carte">
      <rect fill="#fff" width={W} height={H} />

      {DEPENDENT_BOXES.map((box, index) => {
        const dependent = dependents[index]
        const outline = (
          <rect
            x={box.x}
            y={box.y}
            width={BOX.size}
            height={BOX.size}
            rx={BOX.radius}
            fill="none"
            stroke="#028f9d"
            strokeWidth={0.5}
          />
        )
        if (!dependent) return <g key={index}>{outline}</g>
        const inset = 0.25
        const cx = box.x + BOX.size / 2
        const caption = clamp(`${dependent.person.firstName} ${dependent.person.lastName}`, 22)
        return (
          <g key={index}>
            <defs>
              <clipPath id={`${uid}-dep-${index}`}>
                <rect
                  x={box.x + inset}
                  y={box.y + inset}
                  width={BOX.size - inset * 2}
                  height={BOX.size - inset * 2}
                  rx={BOX.radius - inset}
                />
              </clipPath>
            </defs>
            <g clipPath={`url(#${uid}-dep-${index})`}>
              {dependent.person.photoUrl ? (
                <image
                  href={dependent.person.photoUrl}
                  x={box.x + inset}
                  y={box.y + inset}
                  width={BOX.size - inset * 2}
                  height={BOX.size - inset * 2}
                  preserveAspectRatio="xMidYMid slice"
                />
              ) : (
                <Silhouette cx={cx} cy={box.y + BOX.size / 2} r={BOX.size / 2} />
              )}
            </g>
            {outline}
            <text
              x={cx}
              y={box.ty}
              textAnchor="middle"
              fontWeight={700}
              fontSize={fitFontSize(caption, 34, 3.2, 2.2)}
              fill="#0c7986"
              letterSpacing="-.02em"
            >
              {caption}
            </text>
          </g>
        )
      })}

      <text textAnchor="middle" fill="#057887" fontSize={3.81} letterSpacing="-.02em">
        <tspan x={CENTRE} y={212.98}>Cette carte est strictement personnelle. Si vous trouver cette carte veuillez</tspan>
        <tspan x={CENTRE} y={217.55}>la restituer à IPM Tawfeikh. Tout abus ou tentative de fraude sera sanctionné.</tspan>
      </text>

      {/* "BENEFICIAIRES" — outlined in the artwork */}
      <g fill="#028f9d">
        <path d="M51.54,37.17s-.1-.02-.14-.04c.26-.13.47-.3.62-.52.17-.24.25-.52.25-.85,0-.49-.2-.88-.61-1.19-.41-.3-1.02-.45-1.84-.45h-3.21v6.27h3.38c.84,0,1.48-.15,1.92-.45s.66-.72.66-1.27c0-.36-.09-.67-.27-.93s-.44-.45-.77-.58ZM49.59,35.41c.3,0,.52.05.67.15.15.1.22.25.22.45s-.07.35-.22.46-.37.15-.67.15h-1.22v-1.21h1.22ZM50.55,38.96c-.16.1-.39.16-.69.16h-1.49v-1.27h1.49c.3,0,.54.05.69.16s.24.26.24.48-.08.38-.24.48Z" />
        <polygon points="54.9 37.88 57.68 37.88 57.68 36.55 54.9 36.55 54.9 35.5 58.06 35.5 58.06 34.13 53.15 34.13 53.15 40.39 58.18 40.39 58.18 39.02 54.9 39.02 54.9 37.88" />
        <polygon points="63.03 37.47 60.26 34.13 58.81 34.13 58.81 40.39 60.54 40.39 60.54 37.05 63.31 40.39 64.77 40.39 64.77 34.13 63.03 34.13 63.03 37.47" />
        <polygon points="67.42 37.88 70.2 37.88 70.2 36.55 67.42 36.55 67.42 35.5 70.58 35.5 70.58 34.13 65.66 34.13 65.66 40.39 70.69 40.39 70.69 39.02 67.42 39.02 67.42 37.88" />
        <polygon points="71.32 40.39 73.09 40.39 73.09 38.25 75.86 38.25 75.86 36.88 73.09 36.88 73.09 35.5 76.24 35.5 76.24 34.13 71.32 34.13 71.32 40.39" />
        <rect x="76.71" y="34.13" width="1.77" height="6.27" />
        <path d="M81.34,35.96c.15-.16.34-.28.55-.36s.45-.12.71-.12c.3,0,.57.06.81.19.24.12.46.31.67.55l1.13-1.02c-.3-.38-.68-.67-1.14-.88-.46-.2-.97-.3-1.55-.3-.5,0-.95.08-1.37.24s-.79.38-1.09.68c-.31.29-.55.64-.72,1.03-.17.4-.26.83-.26,1.31s.09.92.26,1.31c.17.4.41.74.72,1.03.31.29.67.52,1.09.68.42.16.88.24,1.37.24.58,0,1.1-.1,1.55-.31.46-.21.84-.5,1.14-.87l-1.13-1.02c-.2.24-.43.42-.67.55-.24.13-.51.19-.81.19-.26,0-.49-.04-.71-.13-.21-.08-.4-.2-.55-.36s-.27-.35-.36-.57c-.09-.22-.13-.47-.13-.73s.04-.51.13-.73c.09-.22.21-.41.36-.57Z" />
        <rect x="85.57" y="34.13" width="1.77" height="6.27" />
        <path d="M90.26,34.13l-2.77,6.27h1.81l.49-1.22h2.66l.49,1.22h1.84l-2.78-6.27h-1.75ZM90.31,37.87l.8-2,.8,2h-1.61Z" />
        <rect x="94.92" y="34.13" width="1.77" height="6.27" />
        <path d="M102.91,37.67c.23-.34.34-.75.34-1.22,0-.72-.25-1.28-.74-1.7-.49-.41-1.19-.62-2.11-.62h-2.8v6.27h1.77v-1.67h.97l1.14,1.67h1.9l-1.36-1.98c.38-.18.68-.42.89-.75ZM101.18,35.77c.18.16.27.39.27.68s-.09.51-.27.67c-.18.16-.46.24-.83.24h-.99v-1.83h.99c.37,0,.65.08.83.24Z" />
        <polygon points="105.62 37.88 108.4 37.88 108.4 36.55 105.62 36.55 105.62 35.5 108.78 35.5 108.78 34.13 103.87 34.13 103.87 40.39 108.9 40.39 108.9 39.02 105.62 39.02 105.62 37.88" />
        <path d="M114.31,37.68c-.13-.22-.3-.39-.51-.53-.21-.13-.44-.24-.69-.32-.25-.08-.51-.15-.76-.2s-.49-.11-.7-.16-.38-.12-.51-.2c-.13-.08-.19-.19-.19-.33,0-.11.03-.2.1-.29.07-.08.17-.15.32-.2.15-.05.35-.08.59-.08.28,0,.56.04.85.12.29.08.59.2.89.36l.55-1.32c-.31-.18-.66-.31-1.06-.41-.4-.09-.8-.14-1.21-.14-.62,0-1.13.09-1.54.28-.41.19-.72.43-.93.73s-.31.64-.31,1.02c0,.33.07.61.2.83.13.22.3.39.51.53.21.13.44.24.69.33.25.08.51.15.76.21.25.05.48.11.69.16s.38.12.51.21c.13.08.2.2.2.34,0,.1-.03.19-.1.26-.07.08-.18.13-.33.18-.15.04-.35.07-.59.07-.36,0-.73-.06-1.1-.17-.37-.12-.69-.26-.97-.44l-.58,1.31c.3.2.68.37,1.160.5.47.13.97.19,1.48.19.62,0,1.140-.09,1.54-.28.41-.18.72-.43.92-.74s.31-.64.31-1.01c0-.33-.06-.6-.19-.82Z" />
      </g>
      <text x={CENTRE} y={46.29} textAnchor="middle" fill="#32a994" fontWeight={700} fontSize={4} letterSpacing="-.02em">
        {coverageLine(coverage)}
      </text>

      {/* logo, teal, top right */}
      <g fill="#028f9d">
        <polygon points="134.05 13.23 134.05 11.13 132.8 11.13 130.7 11.13 129.45 11.13 129.45 13.23 130.7 13.23 130.7 23.32 129.45 23.32 129.45 25.41 130.7 25.41 132.8 25.41 134.05 25.41 134.05 23.32 132.8 23.32 132.8 13.23 134.05 13.23" />
        <path d="M135.1,11.13h2.1c.91,0,1.83.23,2.53.89.7.66,1.17,1.75,1.17,3.38s-.47,2.7-1.17,3.36c-.7.66-1.61.93-2.53.93v5.71h-2.1v-14.28ZM137.2,17.56c.64,0,1.05-.12,1.28-.45.23-.31.29-.84.29-1.63s-.06-1.36-.29-1.71c-.23-.35-.64-.51-1.28-.51v4.3Z" />
        <path d="M145.42,25.41l-1.34-8.98-.08-.6h-.12v9.58h-1.94v-14.28h2.57l1.24,6.53.1.76h.04l.1-.76,1.24-6.53h2.57v14.28h-1.94v-9.58h-.12l-.08.6-1.34,8.98h-.89Z" />
        <path d="M130.28,26.63h-.83v-.49h2.26v.49h-.83v2.1h-.6v-2.1Z" />
        <path d="M133.61,28.18h-1.2l-.23.55h-.61l1.15-2.59h.59l1.16,2.59h-.63l-.23-.55ZM133.42,27.72l-.41-.99-.41.99h.82Z" />
        <path d="M138.51,26.14l-.85,2.59h-.64l-.57-1.75-.59,1.75h-.64l-.85-2.59h.62l.58,1.82.61-1.82h.55l.59,1.84.6-1.84h.57Z" />
        <path d="M139.44,26.62v.68h1.2v.48h-1.2v.94h-.6v-2.59h1.96v.48h-1.36Z" />
        <path d="M143.21,28.25v.48h-2.01v-2.59h1.96v.48h-1.36v.56h1.2v.47h-1.2v.6h1.41Z" />
        <path d="M143.69,26.14h.6v2.59h-.6v-2.59Z" />
        <path d="M145.85,27.71l-.35.36v.65h-.6v-2.59h.6v1.21l1.15-1.21h.67l-1.07,1.15,1.14,1.44h-.7l-.83-1.02Z" />
        <path d="M150.02,26.14v2.59h-.6v-1.06h-1.18v1.06h-.6v-2.59h.6v1.02h1.18v-1.02h.6Z" />
        <path d="M127.21,13.28c-1.03.06-1.89.43-2.130.54-.58.27-.86.42-1.24.46-.19.02-.38,0-.58-.02-.35-.06-.51.1-.51.45,0,.64,0,1.28,0,1.91.02,2.26.93,4.08,2.73,5.45.27.21.51.35.57.39.72.44,1.4.64,1.87.75,0-3.31,0-6.61,0-9.920-.16-.02-.41-.03-.72-.01ZM126.91,18.4h-.9v.9h-.89v-.9h-.9v-.89h.9v-.9h.89v.9h.9v.89Z" />
      </g>

      <rect fill="#057887" x="-4.03" y="224.52" width="169.63" height="24.79" />
      <text textAnchor="middle" fill="#fff" fontWeight={700} fontSize={3.81} letterSpacing="-.02em">
        <tspan x={CENTRE} y={234.31}>Contactez nous au +221 76 668 49 34 / +221 76 668 49 33</tspan>
        <tspan x={CENTRE} y={238.88}>Email : contact@ipmtawfeikh.com</tspan>
      </text>
    </svg>
  )
}

/** Recto shows first; a tap turns it over to the ayants droit, and back. */
export function IpmCard({
  holder,
  dependents,
  planName,
  employerName,
  coverage,
  qrValue,
}: {
  holder: FamilyMember
  dependents: FamilyMember[]
  planName: string | null
  employerName: string
  coverage: CardCoverage[]
  qrValue: string
}) {
  const [flipped, setFlipped] = useState(false)
  const reduce = useReducedMotion()
  const uid = useId().replace(/:/g, "")

  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      aria-label={flipped ? "Voir le recto de la carte" : "Voir les bénéficiaires au verso"}
      className="relative block aspect-[161.57/246.61] w-full rounded-2xl text-left outline-none perspective-[1400px] focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <motion.div
        className="relative size-full transform-3d"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 160, damping: 22 }}
      >
        <div className="absolute inset-0 overflow-hidden rounded-2xl bg-white shadow-[0_18px_40px_-18px_rgba(16,67,78,.6)] ring-1 ring-line backface-hidden">
          <Recto holder={holder} employerName={employerName} planName={planName} coverage={coverage} qrValue={qrValue} uid={uid} />
        </div>
        <div className="absolute inset-0 overflow-hidden rounded-2xl bg-white shadow-[0_18px_40px_-18px_rgba(16,67,78,.6)] ring-1 ring-line backface-hidden transform-[rotateY(180deg)]">
          <Verso dependents={dependents} coverage={coverage} uid={uid} />
        </div>
      </motion.div>
    </button>
  )
}
