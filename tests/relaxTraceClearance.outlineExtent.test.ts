import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"

test("projection repairs existing copper intrusion using the outline extent", (): void => {
  const srj: SimpleRouteJson = {
    bounds: { minX: -3, maxX: 3, minY: -2, maxY: 2 },
    outline: [
      { x: -2, y: -1 },
      { x: 2, y: -1 },
      { x: 2, y: 1 },
      { x: -2, y: 1 },
    ],
    obstacles: [],
    connections: [],
    layerCount: 2,
    minTraceWidth: 0.2,
  }
  const routes: HighDensityRoute[] = [
    {
      connectionName: "signal",
      traceThickness: 0.2,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: -1.5, y: 0, z: 0 },
        { x: 0, y: -1, z: 0 },
        { x: 1.5, y: 0, z: 0 },
      ],
    },
  ]
  const original = structuredClone(routes)
  const input = {
    srj,
    routes,
    bounds: srj.bounds,
    boundaryMargin: 0,
    boardEdgeClearance: 0.1,
    lockedPointIndices: [[false, false, false]],
  }
  const solver = new RelaxTraceClearanceSolver(input)
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.solved).toBe(true)
  for (const output of [solver.getOutput(), relaxTraceClearance(input)]) {
    const route = output[0]!
    const gap = route.route[1]!.y - -1 - route.traceThickness / 2
    const displacement = Math.abs(route.route[1]!.y - original[0]!.route[1]!.y)
    expect(gap).toBeGreaterThanOrEqual(0.1 - 1e-9)
    expect(displacement).toBeLessThanOrEqual(0.25)
    expect(route.route[0]).toEqual(original[0]!.route[0])
    expect(route.route.at(-1)).toEqual(original[0]!.route.at(-1))
  }
  expect(routes).toEqual(original)
})
