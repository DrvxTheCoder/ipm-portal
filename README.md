# IPM Tawfeikh — portail participant (prototype)

Clickable, mobile-first prototype of the participant portal for the IPM module
of senexus-multiapp. Next.js 16, TypeScript, shadcn (Base UI) + ReUI, Motion, GSAP.

```bash
npm install
npm run dev        # port 3001; multiapp's URL comes from API_PROXY_TARGET in .env
npm test           # receipt reader, review rules, pharmacy flow, contract copy
```

Demo login: **77 123 45 67**, code **2026** (multiapp's `DEMO_OTP`).

The portal is UI only. Every read and write goes to senexus-multiapp's
`/api/portail/*` (`NEXT_PUBLIC_API_URL`, see `.env.example`); the contract is
`src/lib/schema.ts`, an exact copy of multiapp's `src/server/portal/contract.ts`
(a test checks it when both repositories sit side by side).

## What is real and what is mocked

| Real (multiapp API) | Local / mocked |
|---|---|
| Session, snapshot, notifications, receipt bons (`/vouchers`) | Snapshot cached in localStorage for offline display (`src/lib/store.tsx`) |
| Bon de pharmacie: `/voucher/preview`, `/voucher/issue`, `/voucher/cancel` | `src/lib/mock-data.ts` — **tests only**, never imported at runtime |
| Pharmacy space: `/prestataire/login`, `logout`, `change-password`, `voucher/lookup`, `voucher/validate/preview`, `voucher/validate`, `vouchers`, `vouchers/{id}` | In-browser preview of receipt bons (`src/domain/portal/issue.ts`), instant feedback only — the server decides |
| Ordonnances: signed 10-minute links to `/api/portail/prescriptions/{id}` | |

## Bon de pharmacie (montant différé)

A pharmacy only gives a receipt once paid, so a pharmacy bon is issued without an amount.

1. **Participant** (`/bons/nouveau`, type Pharmacie): who → pharmacy → ordonnance photo
   (quality checks, no OCR, mandatory) → eligibility from the server → bon `AWAITING_AMOUNT`
   with a QR holding the bare token (`BP.…`) and the same code in groups of four for manual entry.
   Nothing is deducted from the balance until validation; the home screen says so.
   Cancellable while awaiting its amount.
2. **Pharmacy** (`/prestataire`): own login (code prestataire + mot de passe, own bearer token,
   forced change of a temporary password). Three things only: *Scanner un bon*, the month's KPI,
   the month's validated bons. Scan → check the ordonnance → amount → split preview → explicit
   confirmation → validated (`SETTLED`). One idempotency key per attempt (bon + amount), reused on
   retry, so a dropped connection never validates twice.
3. **IPM** may validate, adjust or void from the back office; both sides show the API's current
   values ("Ajusté par l'IPM" when `amountSource` is `BACK_OFFICE`).

Ordonnances are shown from the signed link only (`private, no-store`, referrer off, never cached by
the service worker, which skips `/api/*`). A lapsed link offers *Recharger*.

QR scanning uses `BarcodeDetector` where available and `jsqr` otherwise (iPhone). The camera needs
HTTPS (or localhost); a denied permission falls back to typing the code.

## Testing on a phone

The browser only ever calls `/api/portail/*` on the portal itself; `next.config.ts` forwards it to
multiapp (`API_PROXY_TARGET` in `.env`, required — see `.env.example`). So a phone on the same network
needs nothing but the PC's address.

1. Run multiapp on the PC as usual.
2. `pnpm dev:https` (self-signed certificate) — the camera, hence the pharmacy scanner, only
   opens on HTTPS. `pnpm dev` is enough for everything else.
3. On the phone, open `https://<PC IP>:3001` and accept the certificate warning.

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

- Participant fills receipt bons; pharmacies enter the amount of pharmacy bons in `/prestataire`.
- Receipt photo mandatory to attach, not to fill: scan first, or enter manually and attach at the end.
- Total may be typed when there are no lines (departure from `lineTotal`'s "never entered by hand").
- Under the threshold (min of 100 000 F and 50 % of the monthly ceiling): issued at once, flagged if odd.
  Over it: `PENDING_REVIEW`, amount reserved against the ceiling.
- Ceilings per category and per beneficiary, as in the current schema.
- Participants can cancel a bon while `ISSUED`, `PENDING_REVIEW` or `AWAITING_AMOUNT`; the QR token rotates. Never edited, never deleted.
