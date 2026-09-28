import { expect, test } from "bun:test"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { makeBudgetInput, makeBudgetRoute } from "./fixtures/workBudgetFixture"

test("weighted search finds a clearance-safe path within its work budget", (): void => {
  const route = makeBudgetRoute("signal", [
    [-4, -4],
    [4, 4],
  ])
  const { srj, bounds } = makeBudgetInput([route])
  srj.layerCount = 1
  srj.obstacles.push({
    type: "rect",
    center: { x: 0, y: 0 },
    width: 2,
    height: 2,
    layers: ["top"],
    connectedTo: ["pad"],
  })
  const stats: ClearancePathSearchStats = {
    nodesPopped: 0,
    completionReason: "no-path",
  }
  const input = {
    srj,
    bounds,
    routes: [route],
    routeIndex: 0,
    start: route.route[0]!,
    end: route.route[1]!,
    traceThickness: 0.1,
    traceClearance: 0.1,
    viaClearance: 0.1,
    allowLayerChanges: false,
    maxNodes: 1000,
    heuristicWeight: 2,
    stats,
  }
  const path = findClearancePath(input)
  expect(path).not.toBeNull()
  expect(stats.completionReason).toBe("found")
  expect(stats.nodesPopped).toBeLessThanOrEqual(input.maxNodes)
  expect(path![0]).toMatchObject(input.start)
  expect(path!.at(-1)).toMatchObject(input.end)
  expect(
    getFixedObstacleViolations({ srj, routes: [{ ...route, route: path! }] }),
  ).toEqual([])
  expect(() =>
    findClearancePath({ ...input, heuristicWeight: Infinity }),
  ).toThrow()
  expect(() => findClearancePath({ ...input, heuristicWeight: 0.5 })).toThrow()
})
