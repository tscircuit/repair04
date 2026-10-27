import type { SimpleRouteJson } from "high-density-repair03/lib"

export type ViaPadClearanceRules = Pick<
  SimpleRouteJson,
  "defaultObstacleMargin" | "minViaEdgeToPadEdgeClearance"
> & { minPadEdgeToPadEdgeClearance?: number }

/** Electrical clearance does not add a manufacturing gap to connected pads. */
export function getViaPadClearance(
  srj: ViaPadClearanceRules,
  viaClearance: number,
  sameNet: boolean,
): number {
  // Obstacle and dedicated via-pad margins also protect connected pads.
  // Generic pad clearance is a foreign-pad fallback when no dedicated rule exists.
  return Math.max(
    sameNet ? 0 : viaClearance,
    sameNet
      ? 0
      : (srj.minViaEdgeToPadEdgeClearance ??
        srj.minPadEdgeToPadEdgeClearance ??
        0),
    srj.defaultObstacleMargin ?? 0,
    srj.minViaEdgeToPadEdgeClearance ?? 0,
  )
}
