type ClearanceInput = {
  before: Record<string, unknown>[]
  after: Record<string, unknown>[]
}

/** A drill-only repair may remove defects, but cannot exchange or worsen residual contacts. */
export function preservesDrcClearances({
  before,
  after,
}: ClearanceInput): boolean {
  if (after.length >= before.length) return false
  const unmatched = [...before]
  for (const error of after) {
    const id = error[`${error.type}_id`] ?? error.pcb_error_id
    if (typeof id !== "string") return false
    const index = unmatched.findIndex(
      (previous): boolean =>
        previous.type === error.type &&
        (previous[`${previous.type}_id`] ?? previous.pcb_error_id) === id,
    )
    if (index < 0) return false
    const previous = unmatched.splice(index, 1)[0]!
    const previousGap = previous.actual_clearance
    const nextGap = error.actual_clearance
    if (
      typeof previousGap === "number" &&
      (typeof nextGap !== "number" || nextGap < previousGap - 1e-9)
    )
      return false
    if (
      typeof previous.minimum_clearance === "number" &&
      typeof error.minimum_clearance === "number" &&
      error.minimum_clearance > previous.minimum_clearance + 1e-9
    )
      return false
  }
  return true
}
