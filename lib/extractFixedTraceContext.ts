import type { SimplifiedPcbTrace } from "high-density-repair03/lib"
import {
  getSegmentBoundsInterval,
  isPointInBounds,
  REGION_EPSILON,
  repairValueKey,
} from "./repairRegionGeometry"
import { normalizeRepairTrace } from "./normalizeRepairTrace"
import type { Bounds } from "./repairRegionTypes"

type Token = SimplifiedPcbTrace["route"][number]
type Wire = Extract<Token, { route_type: "wire" }>

const interpolateWire = (start: Wire, end: Wire, t: number): Wire => {
  if (t <= REGION_EPSILON) return structuredClone(start)
  if (t >= 1 - REGION_EPSILON) return structuredClone(end)
  const wire = {
    ...structuredClone(start),
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  }
  delete wire.start_pcb_port_id
  delete wire.end_pcb_port_id
  return wire
}

/** Fixed preload copper is clipped independently and never included in merge maps. */
export const extractFixedTraceContext = (
  traces: SimplifiedPcbTrace[],
  bounds: Bounds,
  minTraceWidth: number,
): SimplifiedPcbTrace[] => {
  const result: SimplifiedPcbTrace[] = []
  for (const original of traces) {
    const trace = normalizeRepairTrace(original, minTraceWidth)
    const fragments: Token[][] = []
    let active: Token[] = []
    const finish = (): void => {
      if (active.length > 0) fragments.push(active)
      active = []
    }
    const append = (token: Token): void => {
      if (repairValueKey(active[active.length - 1]) !== repairValueKey(token))
        active.push(structuredClone(token))
    }
    for (let index = 0; index < trace.route.length; index += 1) {
      const token = trace.route[index]!
      const previous = trace.route[index - 1]
      if (
        token.route_type === "wire" &&
        previous?.route_type === "wire" &&
        token.layer === previous.layer
      ) {
        const interval = getSegmentBoundsInterval(previous, token, bounds)
        if (!interval) {
          finish()
          continue
        }
        const start = interpolateWire(previous, token, interval[0])
        const end = interpolateWire(previous, token, interval[1])
        const last = active[active.length - 1]
        if (
          last?.route_type === "wire" &&
          (last.layer !== start.layer ||
            Math.hypot(last.x - start.x, last.y - start.y) > REGION_EPSILON)
        )
          finish()
        append(start)
        append(end)
        if (interval[1] < 1 - REGION_EPSILON) finish()
      } else if (token.route_type === "via") {
        if (!isPointInBounds(token, bounds)) {
          finish()
          continue
        }
        if (previous?.route_type !== "wire")
          throw new Error(
            "repair04 normalized preload via has no incoming wire",
          )
        append(previous)
        append(token)
        const next = trace.route[index + 1]
        if (next?.route_type !== "wire")
          throw new Error(
            "repair04 normalized preload via has no outgoing wire",
          )
        append(next)
      } else if (token.route_type === "wire") {
        if (isPointInBounds(token, bounds)) append(token)
      } else if ("start" in token && "end" in token) {
        const interval = getSegmentBoundsInterval(
          token.start,
          token.end,
          bounds,
        )
        if (!interval) {
          finish()
          continue
        }
        const at = (t: number): { x: number; y: number } => ({
          x: token.start.x + (token.end.x - token.start.x) * t,
          y: token.start.y + (token.end.y - token.start.y) * t,
        })
        append({
          ...structuredClone(token),
          start: at(interval[0]),
          end: at(interval[1]),
        })
        if (interval[1] < 1 - REGION_EPSILON) finish()
      }
    }
    finish()
    for (let index = 0; index < fragments.length; index += 1) {
      result.push({
        ...structuredClone(original),
        pcb_trace_id:
          fragments.length === 1
            ? original.pcb_trace_id
            : `${original.pcb_trace_id}__repair04_fixed_${index}`,
        route: fragments[index]!,
      })
    }
  }
  return result
}
