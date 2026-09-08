import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"

test("permitted pad vias retain same-route mechanical drill spacing", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: -0.5, y: 0, z: 0 },
      { x: -0.05, y: 0, z: 0 },
      { x: -0.05, y: 0, z: 1 },
      { x: 0.05, y: 0, z: 1 },
      { x: 0.05, y: 0, z: 2 },
      { x: 0.5, y: 0, z: 2 },
    ],
    vias: [
      { x: -0.05, y: 0 },
      { x: 0.05, y: 0 },
    ],
  }
  const srj: SimpleRouteJson = {
    allowViaInPad: true,
    layerCount: 3,
    minTraceWidth: 0.1,
    bounds: { minX: -0.75, maxX: 0.75, minY: -0.75, maxY: 0.75 },
    connections: [],
    obstacles: ["top", "bottom"].map((layer) => ({
      kind: "smt_pad",
      type: "rect",
      center: { x: 0, y: 0 },
      width: 2,
      height: 2,
      layers: [layer],
      connectedTo: ["signal"],
    })),
  }
  const stats: ClearancePathSearchStats = {
    nodesPopped: 0,
    completionReason: "no-path",
  }
  const output = findClearancePath({
    srj,
    routes: [route],
    routeIndex: 0,
    start: route.route[0]!,
    end: route.route.at(-1)!,
    bounds: srj.bounds,
    traceThickness: 0.1,
    traceClearance: 0.1,
    viaClearance: 0.1,
    viaHoleDiameter: 0.15,
    existingPath: route.route,
    stats,
  })
  expect(output).not.toBeNull()
  expect(stats.nodesPopped).toBeGreaterThan(0)
  const vias = output!.filter(
    (point, index) => index > 0 && point.z !== output![index - 1]!.z,
  )
  expect(vias.length).toBeGreaterThan(0)
  for (let i = 0; i < vias.length; i++) {
    for (let j = i + 1; j < vias.length; j++) {
      const a = vias[i]!,
        b = vias[j]!
      if (a.x === b.x && a.y === b.y) continue
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
        0.25 - 1e-8,
      )
    }
  }
})
