import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import { findClearancePath } from "../lib/findClearancePath"

test("both path APIs retain the OrangeCrab A6 bend between round surface pads", (): void => {
  // Load the captured SRJ through the same JSON boundary as routing inputs.
  const srj: SimpleRouteJson = JSON.parse(
    readFileSync(
      new URL("./fixtures/orangecrab-a6-round-pads.json", import.meta.url),
      "utf8",
    ),
  )
  const route: HighDensityRoute = {
    connectionName: "source_trace_12",
    traceThickness: 0.0889,
    viaDiameter: 0.28,
    vias: [],
    route: [
      { x: 5.705, y: 5.03, z: 0 },
      { x: 5.54, y: 5.0505, z: 0 },
      { x: 5.425, y: 5.05, z: 0 },
    ],
  }
  const input = {
    srj,
    routes: [route],
    routeIndex: 0,
    start: route.route[0]!,
    end: route.route[2]!,
    bounds: srj.bounds,
    traceThickness: route.traceThickness,
    traceClearance: 0.089,
    viaClearance: 0.1,
    gridSize: 0.0025,
    allowLayerChanges: false,
    maxNodes: 10000,
    existingPath: route.route,
  }
  expect(findClearancePath(input)).toEqual(route.route)
  const stepped = new FindClearancePathSolver(input)
  stepped.solve()
  expect(stepped.getOutput()).toEqual(route.route)
  expect(stepped.stats.nodesPopped).toBe(0)

  const largerClearance = { ...input, traceClearance: 0.1 }
  expect(findClearancePath(largerClearance)).toBeNull()
  const largerStepped = new FindClearancePathSolver(largerClearance)
  largerStepped.solve()
  expect(largerStepped.getOutput()).toBeNull()

  const collision = {
    ...input,
    start: { x: 5.54, y: 5, z: 0 },
    existingPath: [{ x: 5.54, y: 5, z: 0 }, ...route.route.slice(1)],
  }
  expect(findClearancePath(collision)).toBeNull()
  const blocked = new FindClearancePathSolver(collision)
  blocked.solve()
  expect(blocked.getOutput()).toBeNull()
})
