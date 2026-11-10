import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import { findClearancePath } from "../lib/findClearancePath"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"

test("native iMX6 copper uses its explicit circular shape", (): void => {
  const srj: SimpleRouteJson = {
    bounds: { minX: -40, maxX: 40, minY: -35, maxY: 35 },
    layerCount: 6,
    minTraceWidth: 0.12,
    minTraceToPadEdgeClearance: 0.119,
    minViaEdgeToPadEdgeClearance: 0.119,
    connections: [],
    obstacles: [
      {
        type: "rect",
        shape: "circle",
        center: { x: -4.799999999999998, y: -9.400000000000002 },
        width: 0.4,
        height: 0.4,
        layers: ["top", "inner1", "inner2", "inner3", "inner4", "bottom"],
        connectedTo: ["source_trace_33"],
      },
    ],
  }
  const original: HighDensityRoute = {
    connectionName: "source_trace_47",
    traceThickness: 0.12,
    viaDiameter: 0.4,
    vias: [],
    route: [
      { x: -4.3902663688397086, y: -9.147419725715187, z: 2 },
      { x: -4.25, y: -9.4, z: 2 },
    ],
  }
  const repaired = {
    ...original,
    route: [
      { x: -4.427528191418983, y: -9.114637097220612, z: 2 },
      { x: -4.412671914400538, y: -9.576979602344162, z: 2 },
    ],
  }
  const before = structuredClone({ srj, original, repaired })
  expect(getFixedObstacleViolations({ srj, routes: [original] })).toEqual([])
  expect(getFixedObstacleViolations({ srj, routes: [repaired] })).toEqual([])
  const rectangularSrj = {
    ...srj,
    obstacles: [{ ...srj.obstacles[0]!, shape: undefined }],
  }
  const rectangular = getFixedObstacleViolations({
    srj: rectangularSrj,
    routes: [repaired],
  })
  expect(rectangular).toHaveLength(1)
  expect(rectangular[0]!.severity).toBeCloseTo(0.003875642616915559, 9)
  const intrusion = {
    ...repaired,
    route: [
      { x: -4.5, y: -9.4, z: 2 },
      { x: -4.5, y: -9.3, z: 2 },
    ],
  }
  expect(getFixedObstacleViolations({ srj, routes: [intrusion] })).toHaveLength(
    1,
  )

  const start = { x: 0.33, y: 0.33, z: 0 }
  const end = { ...start, z: 1 }
  const route: HighDensityRoute = {
    ...original,
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [start, end],
    vias: [{ x: start.x, y: start.y }],
  }
  for (const layers of [["top"], ["top", "bottom"]]) {
    for (const shape of ["circle", undefined] as const) {
      const input = {
        srj: {
          ...srj,
          layerCount: 2,
          minTraceToPadEdgeClearance: 0.1,
          minViaEdgeToPadEdgeClearance: 0.1,
          obstacles: [
            {
              ...srj.obstacles[0]!,
              center: { x: 0, y: 0 },
              layers,
              shape,
            },
          ],
        },
        routes: [route],
        routeIndex: 0,
        start,
        end,
        bounds: { minX: 0.325, maxX: 0.345, minY: 0.325, maxY: 0.345 },
        traceThickness: 0.1,
        traceClearance: 0.1,
        viaClearance: 0.1,
        gridSize: 0.01,
        existingPath: route.route,
      }
      const expected = shape === "circle" ? route.route : null
      expect(findClearancePath(input)).toEqual(expected)
      const solver = new FindClearancePathSolver(input)
      solver.solve()
      expect(solver.failed).toBeFalse()
      expect(solver.getOutput()).toEqual(expected)
    }
  }
  expect({ srj, original, repaired }).toEqual(before)
})
