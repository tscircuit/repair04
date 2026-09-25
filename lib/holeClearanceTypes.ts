import type { SimpleRouteJson as BaseSimpleRouteJson } from "high-density-repair03/lib"

/** Physical SRJ geometry with an optional edge-to-edge NPTH routing rule. */
export type SimpleRouteJson = Omit<BaseSimpleRouteJson, "obstacles"> & {
  minTraceToHoleEdgeClearance?: number
  obstacles: Array<BaseSimpleRouteJson["obstacles"][number] & {
    isHole?: boolean
    shape?: "circle"
  }>
}
