import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"

test("pour antipads do not constrain via relaxation around real pads", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.45,
    route: [
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 3 },
      { x: 1, y: 0, z: 3 },
    ],
    vias: [{ x: 0, y: 0 }],
  }
  const srj: SimpleRouteJson = {
    bounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
    layerCount: 4,
    minTraceWidth: 0.1,
    connections: [],
    obstacles: [
      {
        type: "rect",
        center: { x: 0.3, y: 0 },
        width: 0.3,
        height: 0.3,
        layers: ["top"],
        connectedTo: ["other"],
      },
    ],
  }
  const withPour = structuredClone(srj)
  withPour.obstacles.push({
    type: "rect",
    center: { x: 0, y: 0 },
    width: 4,
    height: 4,
    layers: ["inner1"],
    connectedTo: ["GND"],
    isCopperPour: true,
  })
  const input = {
    srj,
    routes: [route],
    bounds: srj.bounds,
    boundaryMargin: 0,
    lockedPointIndices: [[true, false, false, true]],
    allowViaMovement: true,
    traceClearance: 0.1,
    viaClearance: 0.1,
  }
  for (const resumable of [false, true]) {
    const run = (params: typeof input): HighDensityRoute[] => {
      if (!resumable) return relaxTraceClearance(params)
      const solver = new RelaxTraceClearanceSolver(params)
      solver.solve()
      expect(solver.failed).toBe(false)
      expect(solver.solved).toBe(true)
      return solver.getOutput()
    }
    const expected = run(input)
    const actual = run({ ...input, srj: withPour })
    expect(actual).toEqual(expected)
    expect(actual[0]!.vias[0]!.x).toBeLessThan(-0.1)
  }
})
