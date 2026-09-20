import { expect, test } from "bun:test"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"
import { makeBudgetInput, makeBudgetRoute } from "./fixtures/workBudgetFixture"

test("a blocked weighted search expands each grid state at most once", (): void => {
  const route = makeBudgetRoute("signal", [
    [-4, 0],
    [4, 0],
  ])
  const { srj, bounds } = makeBudgetInput([route])
  srj.layerCount = 1
  srj.obstacles.push({
    type: "rect",
    center: { x: 0, y: 0 },
    width: 0.5,
    height: 20,
    layers: ["top"],
    connectedTo: ["wall"],
  })
  const stats: ClearancePathSearchStats = {
    nodesPopped: 0,
    completionReason: "found",
  }
  expect(
    findClearancePath({
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
      gridSize: 0.1,
      maxNodes: 100000,
      heuristicWeight: 2,
      stats,
    }),
  ).toBeNull()
  expect(stats.completionReason).toBe("no-path")
  expect(stats.nodesPopped).toBeLessThanOrEqual(100 * 100)
})
