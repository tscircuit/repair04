import { expect, test } from "bun:test"
import type { HighDensityRoute, SimpleRouteJson } from "high-density-repair03/lib"
import { findClearancePath, type ClearancePathSearchStats } from "../lib/findClearancePath"

test("incumbent and searched paths keep distinct holes apart within the same route", (): void => {
  const bounds = { minX: -1.5, maxX: 1.5, minY: -0.5, maxY: 0.5 }
  const signal: HighDensityRoute = {
    connectionName: "signal", traceThickness: 0.1, viaDiameter: 0.3,
    route: [
      { x: -1, y: 0, z: 0 },
      { x: -0.075, y: 0, z: 0 },
      { x: -0.075, y: 0, z: 1 },
      { x: 0.075, y: 0, z: 1 },
      { x: 0.075, y: 0, z: 2 },
      { x: 1, y: 0, z: 2 },
    ],
    vias: [{ x: -0.075, y: 0 }, { x: 0.075, y: 0 }],
  }
  const barriers: HighDensityRoute[] = [0, 2].map((z): HighDensityRoute => ({
    connectionName: `barrier${z}`, traceThickness: 0.05, viaDiameter: 0.3,
    route: [{ x: z === 0 ? 0.2 : -0.2, y: -1, z }, { x: z === 0 ? 0.2 : -0.2, y: 1, z }],
    vias: [],
  }))
  const srj: SimpleRouteJson = {
    bounds, layerCount: 3, minTraceWidth: 0.1, connections: [], obstacles: [],
  }
  for (const existingPath of [undefined, signal.route]) {
    const stats: ClearancePathSearchStats = { nodesPopped: 0, completionReason: "no-path" }
    const output = findClearancePath({
      srj, routes: [signal, ...barriers], routeIndex: 0, bounds,
      start: signal.route[0]!, end: signal.route.at(-1)!,
      traceThickness: 0.1, traceClearance: 0.1, viaClearance: 0.1,
      viaHoleDiameter: 0.15, gridSize: 0.05, maxNodes: 30000,
      existingPath, stats,
    })
    expect(output).not.toBeNull()
    expect(stats.nodesPopped).toBeGreaterThan(0)
    const holes = output!.filter((point, index): boolean => index > 0 && point.z !== output![index - 1]!.z)
    expect(holes.length).toBeGreaterThanOrEqual(2)
    for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) {
      const a = holes[i]!, b = holes[j]!
      if (a.x === b.x && a.y === b.y) continue
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(0.25 - 1e-8)
    }
  }
})
