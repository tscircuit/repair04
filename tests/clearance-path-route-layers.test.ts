import { expect, test } from "bun:test"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import {
  findClearancePath,
  type ClearancePathInput,
} from "../lib/findClearancePath"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { getRepairRouteVias } from "../lib/getRepairRouteVias"

test("clearance repairs retain each route's wire layers and full through-via span", (): void => {
  const start = { x: 1, y: 5, z: 0 }
  const end = { x: 9, y: 5, z: 0 }
  const oldPath = [
    start,
    { x: 2, y: 5, z: 0 },
    { x: 2, y: 5, z: 1 },
    { x: 8, y: 5, z: 1 },
    { x: 8, y: 5, z: 0 },
    end,
  ]
  const input: ClearancePathInput = {
    srj: {
      bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
      layerCount: 4,
      minTraceWidth: 0.1,
      allowBlindAndBuriedVias: false,
      connections: [],
      obstacles: [
        {
          type: "rect",
          center: { x: 5, y: 5 },
          width: 2,
          height: 10,
          layers: ["top"],
          connectedTo: [],
        },
      ],
    },
    routes: [
      {
        connectionName: "byte",
        allowedZ: [0, 3],
        traceThickness: 0.1,
        viaDiameter: 0.4,
        vias: [],
        route: oldPath,
      },
    ],
    routeIndex: 0,
    start,
    end,
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
    traceThickness: 0.1,
    traceClearance: 0.1,
    viaClearance: 0.1,
    gridSize: 1,
    maxNodes: 5000,
    existingPath: oldPath,
  }
  const repaired = findClearancePath(input)
  expect(repaired).not.toBeNull()
  expect(repaired).not.toEqual(oldPath)
  expect(repaired!.some((point) => point.z === 3)).toBeTrue()
  expect(
    repaired!.every((b, index) => {
      const a = repaired![index - 1]
      return (
        !a ||
        a.z !== b.z ||
        (a.x === b.x && a.y === b.y) ||
        input.routes[0]!.allowedZ!.includes(a.z)
      )
    }),
  ).toBeTrue()
  const stepped = new FindClearancePathSolver(input)
  stepped.solve()
  expect(stepped.getOutput()).toEqual(repaired)

  const unrestricted: ClearancePathInput = {
    ...input,
    routes: [{ ...input.routes[0]!, allowedZ: undefined }],
  }
  expect(findClearancePath(unrestricted)).toEqual(oldPath)

  const throughPath = [
    { x: 1, y: 5, z: 1, toNextSegmentType: "through_obstacle" as const },
    { x: 3, y: 5, z: 1 },
  ]
  const throughMetal: ClearancePathInput = {
    ...input,
    start: throughPath[0]!,
    end: throughPath[1]!,
    existingPath: throughPath,
    routes: [{ ...input.routes[0]!, allowedZ: [0], route: throughPath }],
  }
  expect(findClearancePath(throughMetal)).toEqual(throughPath)
  const throughStepped = new FindClearancePathSolver(throughMetal)
  throughStepped.solve()
  expect(throughStepped.getOutput()).toEqual(throughPath)
  const physicalPoints = throughPath.map(({ x, y, z }) => ({ x, y, z }))
  const physicalRoute: ClearancePathInput = {
    ...throughMetal,
    start: physicalPoints[0]!,
    end: physicalPoints[1]!,
    existingPath: physicalPoints,
    routes: [
      {
        ...throughMetal.routes[0]!,
        route: physicalPoints,
        isThroughObstacle: true,
      },
    ],
  }
  expect(findClearancePath(physicalRoute)).toEqual(physicalPoints)
  const physicalStepped = new FindClearancePathSolver(physicalRoute)
  physicalStepped.solve()
  expect(physicalStepped.getOutput()).toEqual(physicalPoints)
  expect(
    findClearancePath({
      ...physicalRoute,
      routes: [{ ...physicalRoute.routes[0]!, isThroughObstacle: false }],
    }),
  ).toBeNull()

  const crossingCopper: ClearancePathInput = {
    ...input,
    routes: [{ ...input.routes[0]!, allowedZ: [0, 1] }],
    srj: {
      ...input.srj,
      obstacles: [
        ...input.srj.obstacles,
        {
          type: "rect",
          center: { x: 2, y: 5 },
          width: 4,
          height: 10,
          layers: ["inner2"],
          connectedTo: [],
        },
        {
          type: "rect",
          center: { x: 8, y: 5 },
          width: 4,
          height: 10,
          layers: ["inner2"],
          connectedTo: [],
        },
      ],
    },
  }
  expect(findClearancePath(crossingCopper)).toBeNull()
  const blocked = new FindClearancePathSolver(crossingCopper)
  blocked.solve()
  expect(blocked.getOutput()).toBeNull()
  expect(
    findClearancePath({
      ...crossingCopper,
      srj: { ...crossingCopper.srj, allowBlindAndBuriedVias: true },
    }),
  ).toEqual(oldPath)

  const repairedRoute = { ...input.routes[0]!, route: repaired! }
  const routes = [
    {
      ...repairedRoute,
      vias: getRepairRouteVias({
        route: repairedRoute,
        mutableBounds: input.bounds,
      }),
    },
  ]
  const region = extractRepairRegion({
    srj: input.srj,
    routes,
    bounds: input.bounds,
  })
  expect(
    region.routes.every((route) => route.allowedZ?.join() === "0,3"),
  ).toBeTrue()
  expect(
    mergeRepairRegion({ routes, region, repairedRoutes: region.routes })[0]!
      .allowedZ,
  ).toEqual([0, 3])
  expect(() =>
    findClearancePath({
      ...input,
      routes: [{ ...input.routes[0]!, allowedZ: [] }],
    }),
  ).toThrow("has invalid allowed wire layers")
})
