import { expect, test } from "bun:test"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"
import { makeBudgetInput, makeBudgetRoute } from "./fixtures/workBudgetFixture"

test("a blocked path leaves search work for a repairable queued span", (): void => {
  const routes = [
    makeBudgetRoute("blocked", [
      [-4, -2],
      [4, -2],
    ]),
    makeBudgetRoute("repairable", [
      [2, 2],
      [4, 2],
    ]),
  ]
  const { srj, bounds } = makeBudgetInput(routes)
  srj.layerCount = 1
  srj.obstacles = [
    {
      type: "rect",
      center: { x: 0, y: 0 },
      width: 0.5,
      height: 20,
      layers: ["top"],
      connectedTo: ["wall"],
    },
    {
      type: "rect",
      center: { x: 3, y: 2 },
      width: 0.3,
      height: 0.3,
      layers: ["top"],
      connectedTo: ["pad"],
    },
  ]
  const input = {
    srj,
    routes,
    bounds,
    dirtyRouteIndices: [0, 1],
    isLocked: (): boolean => true,
    allowLayerChanges: false,
    traceClearance: 0.1,
    viaClearance: 0.1,
    maxPathSearchNodes: 2000,
    maxPathSearchCalls: 8,
  }
  const uncapped = negotiateTraceClearance(input)
  expect(uncapped.pathSearchCalls).toBe(1)
  expect(uncapped.routes[1]).toEqual(routes[1])
  const capped = negotiateTraceClearance({
    ...input,
    maxPathSearchNodesPerCall: 1000,
  })
  expect(capped.pathSearchCalls).toBe(2)
  expect(capped.pathSearchNodes).toBeLessThanOrEqual(2000)
  expect(capped.unresolvedSpanCount).toBe(1)
  expect(capped.routes[0]).toEqual(routes[0])
  expect(capped.routes[1]!.route).not.toEqual(routes[1]!.route)
  expect(
    getFixedObstacleViolations({ srj, routes: [capped.routes[1]!] }),
  ).toEqual([])
  expect(capped.routes[1]!.route[0]).toEqual(routes[1]!.route[0])
  expect(capped.routes[1]!.route.at(-1)).toEqual(routes[1]!.route.at(-1))
})
