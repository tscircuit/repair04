import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { findClearancePath } from "../lib/findClearancePath"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"

test("a through via fits the declared circular BGA pad interstice", (): void => {
  const start = { x: 0.25, y: 0.25, z: 0 }
  const end = { ...start, z: 1 }
  const route: HighDensityRoute = {
    connectionName: "DDR_DQ0",
    traceThickness: 0.0889,
    viaDiameter: 0.28,
    route: [start, end],
    vias: [start],
  }
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.0889,
    minTraceToPadEdgeClearance: 0.089,
    minViaEdgeToPadEdgeClearance: 0.089,
    bounds: { minX: -0.5, minY: -0.5, maxX: 1, maxY: 1 },
    connections: [
      {
        name: "DDR_DQ0",
        pointsToConnect: [
          { ...start, layer: "top" },
          { ...end, layer: "bottom" },
        ],
      },
    ],
    obstacles: [
      [0, 0],
      [0.5, 0],
      [0, 0.5],
      [0.5, 0.5],
    ].map(([x, y], i) => ({
      type: "rect",
      shape: "circle",
      center: { x: x!, y: y! },
      width: 0.23,
      height: 0.23,
      layers: ["top"],
      connectedTo: [`GND_${i}`],
    })),
  }
  expect(
    getFixedObstacleViolations({
      srj,
      routes: [route],
      traceClearance: 0.089,
      viaClearance: 0.089,
    }),
  ).toEqual([])
  const params = {
    srj,
    routes: [route],
    routeIndex: 0,
    start,
    end,
    bounds: { minX: 0.1, minY: 0.1, maxX: 0.4, maxY: 0.4 },
    traceThickness: 0.0889,
    traceClearance: 0.089,
    viaClearance: 0.1,
    viaHoleDiameter: 0.15,
    allowLayerChanges: true,
    maxNodes: 1000,
  }
  const path = findClearancePath(params)
  expect(path).not.toBeNull()
  expect(path![0]).toMatchObject(start)
  expect(path!.at(-1)).toMatchObject(end)
  const squareSrj = {
    ...srj,
    obstacles: srj.obstacles.map(({ shape, ...pad }) => pad),
  }
  expect(
    getFixedObstacleViolations({
      srj: squareSrj,
      routes: [route],
      traceClearance: 0.089,
      viaClearance: 0.089,
    }).length,
  ).toBeGreaterThan(0)
  expect(findClearancePath({ ...params, srj: squareSrj })).toBeNull()
})
