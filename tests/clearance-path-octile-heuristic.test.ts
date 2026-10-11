import { expect, test } from "bun:test"
import { ClearancePathHeap } from "../lib/ClearancePathHeap"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import {
  findClearancePath,
  type ClearancePathInput,
} from "../lib/findClearancePath"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

// Reverse Dijkstra on the actual binary64 grid, including every allowed
// straight terminal connector, provides an independent lower-bound oracle.
function remainingCosts(input: ClearancePathInput): number[] {
  const g = input.gridSize!,
    b = input.bounds
  const nx = Math.floor((b.maxX - b.minX) / g),
    ny = Math.floor((b.maxY - b.minY) / g)
  const count = nx * ny * input.srj.layerCount
  const point = (id: number): RepairRoutePoint => ({
    x: b.minX + ((id % nx) + 0.5) * g,
    y: b.minY + ((Math.floor(id / nx) % ny) + 0.5) * g,
    z: Math.floor(id / (nx * ny)),
  })
  const costs = Array<number>(count).fill(Infinity),
    visited = Array<boolean>(count).fill(false)
  for (let id = 0; id < count; id++) {
    const p = point(id),
      d = Math.hypot(p.x - input.end.x, p.y - input.end.y)
    if (p.z === input.end.z && d < 3 * g) costs[id] = d
  }
  for (let pass = 0; pass < count; pass++) {
    let current = -1
    for (let id = 0; id < count; id++)
      if (!visited[id] && (current < 0 || costs[id]! < costs[current]!))
        current = id
    if (current < 0 || !Number.isFinite(costs[current])) break
    visited[current] = true
    const p = point(current),
      x = current % nx,
      y = Math.floor(current / nx) % ny
    for (let id = 0; id < count; id++) {
      const q = point(id),
        qx = id % nx,
        qy = Math.floor(id / nx) % ny
      const sameLayerNeighbor =
        p.z === q.z &&
        Math.abs(x - qx) <= 1 &&
        Math.abs(y - qy) <= 1 &&
        current !== id
      const layerNeighbor = p.z !== q.z && x === qx && y === qy
      if (!sameLayerNeighbor && !layerNeighbor) continue
      const edge = sameLayerNeighbor ? Math.hypot(p.x - q.x, p.y - q.y) : 1
      costs[id] = Math.min(costs[id]!, costs[current]! + edge)
    }
  }
  return costs
}

test("octile estimate respects grid and terminal cost while both interfaces agree", (): void => {
  const push = ClearancePathHeap.prototype.push
  let sawStrongerEstimate = false
  try {
    for (const [scale, offset, fallback, offCenter] of [
      [1, 0, false, false],
      [0.001, 0, false, false],
      [0.00001, 9999, false, false],
      [0.000001, 0, true, false],
      [1, 20000, true, false],
      [1, 0, false, true],
    ] as const) {
      for (const heuristicWeight of [undefined, 1, 3])
        for (const endLayer of [0, 1]) {
          const effectiveWeight = heuristicWeight ?? 1
          const bounds = {
            minX: offset - 4 * scale,
            maxX: offset + 4 * scale,
            minY: offset - 4 * scale,
            maxY: offset + 4 * scale,
          }
          const start = { x: offset - 3 * scale, y: offset - scale, z: 0 }
          const end = offCenter
            ? {
                x: offset + (0.5 + 2.99999 * Math.cos(Math.PI / 8)) * scale,
                y: offset + (0.5 + 2.99999 * Math.sin(Math.PI / 8)) * scale,
                z: endLayer,
              }
            : { x: offset + 3 * scale, y: offset + scale, z: endLayer }
          const input: ClearancePathInput = {
            srj: {
              bounds,
              connections: [],
              obstacles: [],
              layerCount: 2,
              minTraceWidth: 0.1,
            },
            routes: [
              {
                connectionName: "signal",
                traceThickness: 0.1,
                viaDiameter: 0.3,
                vias: [],
                route: [start, end],
              },
            ],
            routeIndex: 0,
            start,
            end,
            bounds,
            traceThickness: 0.1,
            traceClearance: 0.1,
            viaClearance: 0.1,
            gridSize: scale,
            heuristicWeight,
            maxNodes: 1000,
          }
          const remaining = remainingCosts(input)
          const nx = Math.floor((bounds.maxX - bounds.minX) / scale),
            ny = Math.floor((bounds.maxY - bounds.minY) / scale)
          const outputs: Array<RepairRoutePoint[] | null> = [],
            work: unknown[] = [],
            estimates: number[][] = []
          for (const stepped of [false, true]) {
            const actualEstimates: number[] = []
            const sampled = new Map<number, number>()
            ClearancePathHeap.prototype.push = function (entry): void {
              const p = {
                x: bounds.minX + ((entry.id % nx) + 0.5) * scale,
                y:
                  bounds.minY +
                  ((Math.floor(entry.id / nx) % ny) + 0.5) * scale,
                z: Math.floor(entry.id / (nx * ny)),
              }
              const euclidean =
                Math.hypot(p.x - end.x, p.y - end.y) + (p.z === end.z ? 0 : 1)
              const estimate = (entry.priority - entry.cost) / effectiveWeight
              const tolerance = 1e-9 * Math.max(1, Math.abs(estimate))
              expect(estimate).toBeLessThanOrEqual(
                remaining[entry.id]! + tolerance,
              )
              expect(estimate + tolerance).toBeGreaterThanOrEqual(euclidean)
              if (fallback || effectiveWeight === 1)
                expect(Math.abs(estimate - euclidean)).toBeLessThanOrEqual(
                  tolerance,
                )
              else if (estimate > euclidean + tolerance)
                sawStrongerEstimate = true
              actualEstimates.push(estimate)
              sampled.set(entry.id, estimate)
              push.call(this, entry)
            }
            const stats = {
              nodesPopped: 0,
              completionReason: "no-path" as const,
            }
            const args = { ...input, stats }
            if (stepped) {
              const solver = new FindClearancePathSolver(args)
              while (!solver.solved && !solver.failed) solver.step()
              expect(solver.failed).toBeFalse()
              outputs.push(solver.getOutput())
            } else outputs.push(findClearancePath(args))
            work.push(stats)
            estimates.push(actualEstimates)
            expect(stats.nodesPopped).toBeLessThanOrEqual(input.maxNodes!)
            for (const [id, estimate] of sampled)
              for (const [otherId, otherEstimate] of sampled) {
                const x = id % nx,
                  y = Math.floor(id / nx) % ny,
                  z = Math.floor(id / (nx * ny))
                const qx = otherId % nx,
                  qy = Math.floor(otherId / nx) % ny,
                  qz = Math.floor(otherId / (nx * ny))
                const xyNeighbor =
                  z === qz &&
                  Math.abs(x - qx) <= 1 &&
                  Math.abs(y - qy) <= 1 &&
                  id !== otherId
                const layerNeighbor = z !== qz && x === qx && y === qy
                if (!xyNeighbor && !layerNeighbor) continue
                const edge = xyNeighbor
                  ? Math.hypot(
                      bounds.minX +
                        (x + 0.5) * scale -
                        (bounds.minX + (qx + 0.5) * scale),
                      bounds.minY +
                        (y + 0.5) * scale -
                        (bounds.minY + (qy + 0.5) * scale),
                    )
                  : 1
                expect(estimate).toBeLessThanOrEqual(
                  edge + otherEstimate + 1e-9 * Math.max(1, Math.abs(estimate)),
                )
              }
          }
          expect(outputs[0]).not.toBeNull()
          expect(outputs[1]).toEqual(outputs[0])
          expect(work[1]).toEqual(work[0])
          expect(estimates[1]).toEqual(estimates[0])
        }
    }
    expect(sawStrongerEstimate).toBeTrue()
  } finally {
    ClearancePathHeap.prototype.push = push
  }
})
