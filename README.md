# IPM Tawfeikh — portail participant (prototype)

Clickable, mobile-first prototype of the participant portal for the IPM module
of senexus-multiapp. Next.js 16, TypeScript, shadcn (Base UI) + ReUI, Motion, GSAP.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # receipt reader + review rules
```

Demo login: **77 123 45 67**, code **2026**. Profil → "Réinitialiser la démo" restores the seed.

## What is real and what is mocked

| Real | Mocked |
|---|---|
| Issuance rules — `src/domain/ipm/*` copied verbatim from `src/server/domain/ipm/` | Database: in memory, mirrored to localStorage (`src/lib/store.tsx`) |
| Review policy — `src/domain/portal/review.ts` | SMS code (fixed to 2026) |
| Receipt quality check, dHash, OCR (Claude or Tesseract), parser | Contribution standing (assumed paid through last month) |
| Types mirroring Prisma — `src/lib/schema.ts` | |

Schema additions the portal needs: `prisma/portal-additions.prisma`.

## Receipt reading

1. In the browser: downscale, darkness / glare / blur check, perceptual hash.
2. `POST /api/ocr` → Claude vision if `ANTHROPIC_API_KEY` is set (see `.env.example`).
3. Otherwise Tesseract.js (French) in the browser. It fetches its worker and
   language data from jsDelivr on first use; to work offline, copy them to
   `public/tesseract/` and pass `workerPath`, `corePath`, `langPath` in
   `src/lib/ocr/read-receipt.ts`.
4. `src/domain/portal/receipt-parse.ts` extracts total, lines, date and header;
   the header is matched against agreed providers. The participant always confirms.

## Decisions encoded here

- Participant fills the bon; no provider interface.
- Receipt photo mandatory to attach, not to fill: scan first, or enter manually and attach at the end.
- Total may be typed when there are no lines (departure from `lineTotal`'s "never entered by hand").
- Under the threshold (min of 100 000 F and 50 % of the monthly ceiling): issued at once, flagged if odd.
  Over it: `PENDING_REVIEW`, amount reserved against the ceiling.
- Ceilings per category and per beneficiary, as in the current schema.
- Participants can cancel a bon while `ISSUED` or `PENDING_REVIEW`; the QR token rotates. Never edited, never deleted.
