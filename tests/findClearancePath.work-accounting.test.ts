import { expect, test } from "bun:test"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"
import { makeBudgetInput, makeBudgetRoute } from "./fixtures/workBudgetFixture"

test("path accounting distinguishes zero-pop endpoint rejection, exhausted frontier, and actual node cap", (): void => {
  const route = makeBudgetRoute("crossing", [
      [-4, 0],
      [4, 0],
    ]),
    input = makeBudgetInput([route])
  input.srj.obstacles.push({
    type: "rect",
    center: { x: 0, y: 0 },
    width: 0.5,
    height: 20,
    layers: ["top"],
    connectedTo: ["pcb_smtpad_wall"],
  })
  const stats: ClearancePathSearchStats = {
    nodesPopped: 99,
    completionReason: "found",
  }
  const args = {
    srj: input.srj,
    routes: input.routes,
    routeIndex: 0,
    start: route.route[0]!,
    end: route.route[1]!,
    bounds: input.bounds,
    traceThickness: 0.1,
    traceClearance: 0.1,
    viaClearance: 0.1,
    allowLayerChanges: false,
    gridSize: 0.5,
    stats,
  }
  expect(findClearancePath({ ...args, start: { x: 0, y: 0, z: 0 } })).toBeNull()
  expect(stats).toEqual({ nodesPopped: 0, completionReason: "no-path" })
  expect(findClearancePath({ ...args, maxNodes: 2 })).toBeNull()
  expect(stats).toEqual({ nodesPopped: 2, completionReason: "node-limit" })
  expect(findClearancePath({ ...args, maxNodes: 30000 })).toBeNull()
  expect(stats.nodesPopped).toBeGreaterThan(2)
  expect(stats.nodesPopped).toBeLessThan(30000)
  expect(stats.completionReason).toBe("no-path")
  expect(findClearancePath({ ...args, gridSize: 0.025 })).toBeNull()
  expect(stats).toEqual({ nodesPopped: 30000, completionReason: "node-limit" })
  const plain = { ...args, srj: { ...input.srj, obstacles: [] } }
  const normal = findClearancePath({ ...plain, stats: undefined })
  expect(normal).not.toBeNull()
  expect(findClearancePath({ ...plain, maxNodes: 30000 })).toEqual(normal)
  expect(stats.completionReason).toBe("found")
  expect(stats.nodesPopped).toBeGreaterThan(0)
})
