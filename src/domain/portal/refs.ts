/** `member:<id>` or `dependent:<id>` — same as server/queries/ipm/vouchers.ts. */
export function beneficiaryRef(memberId: string, dependentId: string | null): string {
  return dependentId ? `dependent:${dependentId}` : `member:${memberId}`
}
