import { expect, test } from "bun:test"
import { segmentToSegmentMinDistance } from "@tscircuit/math-utils"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"

test("preserves an interior tee attachment while opening unrelated clearances", (): void => {
  for (const angle of [0, Math.PI / 3]) {
    const point = (x: number, y: number): { x: number; y: number; z: number } => ({
      x: 10 + x * Math.cos(angle) - y * Math.sin(angle),
      y: -7 + x * Math.sin(angle) + y * Math.cos(angle),
      z: 0,
    })
    const makeRoute = (
      name: string,
      coordinates: number[][],
      root = name,
    ): HighDensityRoute => ({
      connectionName: name,
      rootConnectionName: root,
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: coordinates.map(([x, y]) => point(x!, y!)),
    })
    const routes = [
      makeRoute("trunk", [[-2, 0], [-1, 0], [1, 0], [2, 0]], "tee-net"),
      makeRoute("branch", [[0, 0], [0, -1]], "tee-net"),
      makeRoute("fixed-neighbor", [[-0.7, 0.01], [0.7, 0.01]]),
      makeRoute("free-a", [[-3, 2.2], [-1, 2.5], [1, 2.5], [3, 2.2]]),
      makeRoute("free-b", [[-3, 2.97], [-1, 2.67], [1, 2.67], [3, 2.97]]),
    ]
    const before = structuredClone(routes)
    const bounds = { minX: 4, maxX: 16, minY: -13, maxY: -1 }
    const output = relaxTraceClearance({
      srj: {
        layerCount: 2,
        minTraceWidth: 0.1,
        bounds,
        obstacles: [],
        connections: routes.map((route) => ({
          name: route.connectionName,
          rootConnectionName: route.rootConnectionName,
          pointsToConnect: [],
        })),
      },
      routes,
      bounds,
      boundaryMargin: 0,
      lockedPointIndices: routes.map((route) => route.route.map(() => false)),
    })
    expect(routes).toEqual(before)
    // There is no trunk vertex at the branch endpoint. Keep its supporting
    // segment fixed rather than breaking the contact or inserting a vertex.
    expect(output[0]).toEqual(routes[0])
    expect(output[1]).toEqual(routes[1])
    expect(
      segmentToSegmentMinDistance(
        output[0]!.route[1]!,
        output[0]!.route[2]!,
        output[1]!.route[0]!,
        output[1]!.route[0]!,
      ),
    ).toBeLessThan(1e-12)
    expect(output[3]!.route).not.toEqual(routes[3]!.route)
    expect(
      segmentToSegmentMinDistance(
        output[3]!.route[1]!,
        output[3]!.route[2]!,
        output[4]!.route[1]!,
        output[4]!.route[2]!,
      ) - 0.1,
    ).toBeGreaterThanOrEqual(0.1 - 1e-7)
    for (let i = 0; i < routes.length; i += 1) {
      expect(output[i]!.route.map((p) => p.z)).toEqual(
        routes[i]!.route.map((p) => p.z),
      )
      expect(output[i]!.route[0]).toEqual(routes[i]!.route[0])
      expect(output[i]!.route.at(-1)).toEqual(routes[i]!.route.at(-1))
      expect(output[i]!.traceThickness).toBe(routes[i]!.traceThickness)
      expect(output[i]!.viaDiameter).toBe(routes[i]!.viaDiameter)
    }
  }
})
