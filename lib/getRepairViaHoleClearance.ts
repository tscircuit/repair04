import type { SimpleRouteJson } from "high-density-repair03/lib"

/** Drill spacing is independent of the annular copper clearance. */
export function getRepairViaHoleClearance(
  srj: SimpleRouteJson & { minViaHoleEdgeToViaHoleEdgeClearance?: number },
  copperClearance: number,
): number {
  const clearance = srj.minViaHoleEdgeToViaHoleEdgeClearance ?? copperClearance
  if (!Number.isFinite(clearance) || clearance < 0) {
    throw new Error(
      "repair04: via hole clearance must be finite and nonnegative",
    )
  }
  return clearance
}
