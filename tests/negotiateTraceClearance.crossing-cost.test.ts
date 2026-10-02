import { expect, test } from "bun:test"
import {
  AutoroutingDrcEngine,
  type HighDensityRoute,
  type SimpleRouteJson,
} from "high-density-repair03/lib"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"

test("a short pad detour avoids displacing a long perpendicular track", (): void => {
  const bounds = { minX: -4.5, maxX: 4.5, minY: -4.5, maxY: 4.5 }
  const srj: SimpleRouteJson = {
    bounds,
    layerCount: 1,
    minTraceWidth: 0.1,
    connections: [],
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0.5 },
        width: 0.6,
        height: 1.4,
        layers: ["top"],
        connectedTo: ["pad"],
      },
    ],
  }
  const routes: HighDensityRoute[] = [
    {
      connectionName: "signal",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: -3, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
      ],
    },
    {
      connectionName: "long-neighbor",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: 0, y: -4.5, z: 0 },
        { x: 0, y: -0.35, z: 0 },
      ],
    },
  ]
  const result = negotiateTraceClearance({
    srj,
    routes,
    bounds,
    dirtyRouteIndices: [0],
    isLocked: (): boolean => true,
    allowLayerChanges: false,
    traceClearance: 0.1,
    viaClearance: 0.1,
    maxPathSearchNodes: 120000,
    maxPathSearchCalls: 1,
  })
  const engine = new AutoroutingDrcEngine(srj)
  expect(
    engine.evaluate(convertRepairRoutesToTraces(result.routes, 1)).errors,
  ).toHaveLength(0)
  expect(result.routes[1]).toEqual(routes[1])
  expect(result.pathSearchCalls).toBe(1)
  expect(result.unresolvedSpanCount).toBe(0)
})
