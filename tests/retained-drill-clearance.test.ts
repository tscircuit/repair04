import { expect, test } from "bun:test"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import { findClearancePath } from "../lib/findClearancePath"

test("clearance searches reserve retained drills even on the same net", (): void => {
  const input = {
    srj: {
      layerCount: 2,
      minTraceWidth: 0.1,
      allowViaInPad: true,
      minViaHoleEdgeToViaHoleEdgeClearance: 0.4,
      bounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
      connections: [{ name: "GND", pointsToConnect: [] }],
      obstacles: [
        {
          type: "rect" as const,
          shape: "circle" as const,
          center: { x: 0, y: 0 },
          width: 0.6,
          height: 0.6,
          holeDiameter: 0.3,
          layers: ["top", "bottom"],
          connectedTo: ["GND"],
        },
      ],
    },
    routes: [
      {
        connectionName: "GND",
        traceThickness: 0.1,
        viaDiameter: 0.45,
        route: [
          { x: 0.6, y: 0, z: 0 },
          { x: 0.6, y: 0, z: 1 },
        ],
        vias: [{ x: 0.6, y: 0 }],
      },
    ],
    routeIndex: 0,
    start: { x: 0.6, y: 0, z: 0 },
    end: { x: 0.6, y: 0, z: 1 },
    bounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
    traceThickness: 0.1,
    traceClearance: 0.1,
    viaClearance: 0.1,
    viaHoleDiameter: 0.2,
    gridSize: 0.05,
    maxNodes: 30000,
  }
  const solver = new FindClearancePathSolver(input)
  solver.solve()
  expect(solver.failed).toBeFalse()
  for (const path of [findClearancePath(input), solver.getOutput()]) {
    expect(path).not.toBeNull()
    let vias = 0
    for (let i = 1; i < path!.length; i++) {
      const a = path![i - 1]!,
        b = path![i]!
      if (a.z === b.z) continue
      vias++
      expect(Math.hypot(a.x, a.y) - 0.15 - 0.1).toBeGreaterThanOrEqual(
        0.4 - 1e-8,
      )
    }
    expect(vias).toBeGreaterThan(0)
  }
})
