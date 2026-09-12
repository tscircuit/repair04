import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"

test("repairs isolated trace and via board-edge violations without another copper conflict", () => {
  for (const via of [false, true]) {
    const routes: HighDensityRoute[] = [
      {
        connectionName: "signal",
        traceThickness: 0.1,
        viaDiameter: 0.3,
        vias: via ? [{ x: 0, y: 1.9 }] : [],
        route: [
          { x: -1, y: 0, z: 0 },
          { x: 0, y: 1.9, z: 0 },
          ...(via ? [{ x: 0, y: 1.9, z: 1 }] : []),
          { x: 1, y: 0, z: via ? 1 : 0 },
        ],
      },
    ]
    const srj: SimpleRouteJson = {
      bounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
      obstacles: [],
      connections: [],
      layerCount: 2,
      minTraceWidth: 0.1,
    }
    const original = structuredClone(routes)
    const result = relaxTraceClearance({
      srj,
      routes,
      bounds: srj.bounds,
      boundaryMargin: 0,
      boardEdgeClearance: 0.2,
      lockedPointIndices: routes.map((r) => r.route.map(() => false)),
      traceClearance: 0.1,
      viaClearance: 0.1,
      allowViaMovement: true,
    })
    const point = result[0]!.route[1]!
    expect(
      srj.bounds.maxY - point.y - (via ? 0.15 : 0.05),
    ).toBeGreaterThanOrEqual(0.2)
    expect(result[0]!.route[0]).toEqual(original[0]!.route[0])
    expect(result[0]!.route.at(-1)).toEqual(original[0]!.route.at(-1))
    if (via) expect(result[0]!.route[2]).toEqual({ ...point, z: 1 })
    expect(routes).toEqual(original)
  }
})
