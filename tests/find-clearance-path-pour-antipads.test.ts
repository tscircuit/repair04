import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { findClearancePath } from "../lib/findClearancePath"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"

test("through vias cross pours through antipads while foreign wires and solid copper remain blocked", (): void => {
  const start = { x: -1, y: 0, z: 0 }
  const end = { x: 1, y: 0, z: 3 }
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.45,
    route: [start, end],
    vias: [],
  }
  const srj: SimpleRouteJson = {
    bounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
    layerCount: 4,
    minTraceWidth: 0.1,
    connections: [
      {
        name: "signal",
        pointsToConnect: [
          { ...start, layer: "top" },
          { ...end, layer: "bottom" },
        ],
      },
    ],
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 4,
        height: 4,
        layers: ["inner1"],
        connectedTo: ["GND"],
        isCopperPour: true,
      },
    ],
  }
  const input = {
    srj,
    routes: [route],
    routeIndex: 0,
    start,
    end,
    bounds: srj.bounds,
    traceThickness: 0.1,
    traceClearance: 0.1,
    viaClearance: 0.1,
    viaHoleDiameter: 0.2,
    maxNodes: 100_000,
  }
  for (const resumable of [false, true]) {
    const run = (
      params: typeof input,
    ): ReturnType<typeof findClearancePath> => {
      if (!resumable) return findClearancePath(params)
      const solver = new FindClearancePathSolver(params)
      solver.solve()
      expect(solver.failed).toBe(false)
      expect(solver.solved).toBe(true)
      return solver.getOutput()
    }
    const path = run(input)
    expect(path).not.toBeNull()
    expect(path![0]).toMatchObject(start)
    expect(path!.at(-1)).toMatchObject(end)
    expect(path!.some((p, i) => i > 0 && p.z !== path![i - 1]!.z)).toBe(true)
    const solid = structuredClone(srj)
    solid.obstacles[0]!.isCopperPour = false
    expect(run({ ...input, srj: solid })).toBeNull()
    const onPlane = {
      ...input,
      start: { ...start, z: 1 },
      end: { ...end, z: 1 },
      allowLayerChanges: false,
    }
    expect(run(onPlane)).toBeNull()
    const ownPlane = structuredClone(srj)
    ownPlane.obstacles[0]!.connectedTo = ["signal"]
    expect(run({ ...onPlane, srj: ownPlane })).not.toBeNull()
  }
})
