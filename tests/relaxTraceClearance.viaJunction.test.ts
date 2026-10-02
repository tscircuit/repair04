import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"

test("retains a via attached to the copper edge of a same-net branch", (): void => {
  const routes: HighDensityRoute[] = [
    {
      connectionName: "via-route",
      rootConnectionName: "shared-net",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [{ x: 0, y: 0 }],
      route: [
        { x: -2, y: -1, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 2, y: -1, z: 1 },
      ],
    },
    {
      connectionName: "branch",
      rootConnectionName: "shared-net",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: 0, y: 0.19, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
    },
    {
      connectionName: "foreign-neighbor",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: -0.5, y: 0.21, z: 1 },
        { x: 0.5, y: 0.21, z: 1 },
      ],
    },
  ]
  const before = structuredClone(routes)
  const bounds = { minX: -3, maxX: 3, minY: -2, maxY: 2 }
  const srj = {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds,
    obstacles: [],
    connections: routes.map((route) => ({
      name: route.connectionName,
      rootConnectionName: route.rootConnectionName,
      pointsToConnect: [],
    })),
  }
  const output = relaxTraceClearance({
    srj,
    routes,
    bounds,
    boundaryMargin: 0,
    lockedPointIndices: routes.map((route) => route.route.map(() => false)),
    allowViaMovement: true,
  })
  expect(routes).toEqual(before)
  expect(output[0]).toEqual(routes[0])
  expect(output[1]).toEqual(routes[1])
  // The same geometry on another net has no electrical attachment to retain.
  const foreignRoutes = structuredClone(routes)
  foreignRoutes[1]!.rootConnectionName = "other-net"
  const free = relaxTraceClearance({
    srj: {
      ...srj,
      connections: foreignRoutes.map((route) => ({
        name: route.connectionName,
        rootConnectionName: route.rootConnectionName,
        pointsToConnect: [],
      })),
    },
    routes: foreignRoutes,
    bounds,
    boundaryMargin: 0,
    lockedPointIndices: routes.map((route) => route.route.map(() => false)),
    allowViaMovement: true,
  })
  expect(free[0]!.vias).not.toEqual(routes[0]!.vias)
  expect(free[0]!.route.map((point) => point.z)).toEqual(
    routes[0]!.route.map((point) => point.z),
  )
})
