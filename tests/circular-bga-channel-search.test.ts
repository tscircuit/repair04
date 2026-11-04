import { expect, test } from "bun:test"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import {
  findClearancePath,
  type ClearancePathInput,
} from "../lib/findClearancePath"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"

test("an offset search grid can reach the channel between circular BGA pads", (): void => {
  const srj: ClearancePathInput["srj"] = {
    layerCount: 2,
    minTraceWidth: 0.0889,
    minViaDiameter: 0.28,
    defaultObstacleMargin: 0.089,
    minTraceToPadEdgeClearance: 0.089,
    minViaEdgeToPadEdgeClearance: 0.089,
    bounds: { minX: -0.5, maxX: 1, minY: -0.5, maxY: 1 },
    connections: [{ name: "signal", pointsToConnect: [] }],
    obstacles: [0, 0.5].flatMap((x) =>
      [0, 0.5].map((y) => ({
        type: "rect" as const,
        shape: "circle" as const,
        center: { x, y },
        width: 0.23,
        height: 0.23,
        layers: ["top"],
        connectedTo: [`foreign_${x}_${y}`],
      })),
    ),
  }
  const route = {
    connectionName: "signal",
    traceThickness: 0.0889,
    viaDiameter: 0.28,
    route: [
      { x: 0.25, y: 0.12, z: 0 },
      { x: 0.25, y: 0.38, z: 1 },
    ],
    vias: [],
  }
  const input: ClearancePathInput = {
    srj,
    routes: [route],
    routeIndex: 0,
    start: route.route[0]!,
    end: route.route[1]!,
    bounds: { minX: 0.11, maxX: 0.41, minY: 0.11, maxY: 0.41 },
    traceThickness: 0.0889,
    traceClearance: 0.089,
    viaClearance: 0.1,
    viaHoleDiameter: 0.15,
    gridSize: 0.1,
    allowLayerChanges: true,
  }
  const solver = new FindClearancePathSolver(input)
  solver.solve()
  const paths = [findClearancePath(input), solver.getOutput()]
  for (const path of paths) {
    expect(path).not.toBeNull()
    const viaIndex = path!.findIndex(
      (point, index) => index > 0 && point.z !== path![index - 1]!.z,
    )
    expect(viaIndex).toBeGreaterThan(0)
    expect(path![viaIndex]!.x).toBeCloseTo(0.25, 7)
    expect(path![viaIndex]!.y).toBeCloseTo(0.25, 7)
    expect(
      getFixedObstacleViolations({ srj, routes: [{ ...route, route: path! }] }),
    ).toHaveLength(0)
  }
  expect(paths[0]).toEqual(paths[1])
})
