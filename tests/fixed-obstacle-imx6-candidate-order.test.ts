import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  createFixedObstacleViolationEvaluator,
  getFixedObstacleViolations,
  type FixedObstacleViolation,
} from "../lib/getFixedObstacleViolations"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("preserves the native iMX6 fixed-copper contact and candidate order", (): void => {
  // Current published iMX6 Joint entry: source50 via and earlier source31 copper.
  // Original obstacle509 and the four adjacent native route vertices.
  const route: Omit<HighDensityRoute, "route"> & { route: RepairRoutePoint[] } =
    {
      connectionName: "source_trace_50_mst1",
      rootConnectionName: "source_trace_50",
      traceThickness: 0.12,
      viaDiameter: 0.4,
      route: [
        {
          x: -4.814594376081858,
          y: -0.01640562391814245,
          z: 0,
          traceThickness: 0.12,
        },
        {
          x: -4.944392394775091,
          y: -0.03902920868146321,
          z: 0,
          traceThickness: 0.12,
        },
        {
          x: -4.944392394775091,
          y: -0.03902920868146321,
          z: 5,
          traceThickness: 0.12,
        },
        { x: -4.707107459767246, y: -0.026, z: 5, traceThickness: 0.12 },
      ],
      vias: [{ x: -4.944392394775091, y: -0.03902920868146321 }],
    }
  const srj: SimpleRouteJson & { allowBlindAndBuriedVias: boolean } = {
    bounds: { minX: -40, maxX: 40, minY: -35, maxY: 35 },
    layerCount: 6,
    allowBlindAndBuriedVias: false,
    minTraceWidth: 0.12,
    minViaDiameter: 0.4,
    minTraceToPadEdgeClearance: 0.119,
    minViaEdgeToPadEdgeClearance: 0.119,
    connections: [],
    obstacles: [
      {
        type: "rect",
        center: { x: -5.200000000000001, y: 2.2499999999999996 },
        width: 0.12,
        height: 13.020000000000001,
        layers: ["bottom"],
        zLayers: [5],
        connectedTo: ["source_trace_31"],
      },
    ],
  }
  const routes = [route, structuredClone(route)]
  const original = structuredClone({ srj, routes })
  const expected: FixedObstacleViolation[] = [0, 1].map((routeIndex) => ({
    key: `fixed-obstacle:${routeIndex}:0:via`,
    center: { x: -4.944392394775091, y: -0.03902920868146321 },
    routeIndex,
    obstacleIndex: 0,
    kind: "via",
    severity: 0.12339239477509034,
  }))
  expect(getFixedObstacleViolations({ srj, routes })).toEqual(expected)
  const evaluate = createFixedObstacleViolationEvaluator({ srj, routes })
  expect(evaluate(routes)).toEqual(expected)
  const outside = {
    ...route,
    route: [
      { x: 25, y: 25, z: 0 },
      { x: 26, y: 26, z: 0 },
    ],
    vias: [],
  }
  expect(evaluate([outside, route])).toEqual([expected[1]!])
  expect({ srj, routes }).toEqual(original)
})
