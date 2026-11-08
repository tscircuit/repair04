import type { RepairRoutePoint as Point } from "./repairRegionTypes"

/** Checked straight and orthogonal edges connecting exact anchors to the grid. */
export const findClearanceAnchorAttachment = (
  a: Point,
  b: Point,
  clear: (a: Point, b: Point) => boolean,
  extraCost: (a: Point, b: Point) => number,
): { path: Point[]; cost: number } | undefined => {
  const candidates = [
    [a, b],
    [a, { ...a, y: b.y }, b],
    [a, { ...a, x: b.x }, b],
  ]
  const orthogonalLength = Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
  let best: { path: Point[]; cost: number } | undefined
  for (const path of candidates) {
    let cost = 0
    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1]!,
        to = path[i]!
      if (!clear(from, to)) {
        cost = Infinity
        break
      }
      cost += Math.hypot(to.x - from.x, to.y - from.y) + extraCost(from, to)
    }
    if (Number.isFinite(cost) && (!best || cost < best.cost))
      best = { path, cost }
    // Congestion costs are nonnegative. Once a candidate beats the geometric
    // lower bound for both orthogonal edges, neither can improve it.
    if (best && best.cost <= orthogonalLength) return best
    if (a.x === b.x || a.y === b.y) return best
  }
  return best
}
