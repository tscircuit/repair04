import { expect, test } from "bun:test"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"
import { makeBudgetInput, makeBudgetRoute } from "./fixtures/workBudgetFixture"

test("coarser path searches preserve anchors and pad clearance with less work", (): void => {
  const routes = [
    makeBudgetRoute("signal", [
      [-4, 0],
      [4, 0],
    ]),
  ]
  const { srj, bounds } = makeBudgetInput(routes)
  srj.layerCount = 1
  srj.obstacles = [
    {
      type: "rect",
      center: { x: 0, y: 0 },
      width: 0.8,
      height: 3,
      layers: ["top"],
      connectedTo: ["pad"],
    },
  ]
  const input = {
    srj,
    routes,
    bounds,
    dirtyRouteIndices: [0],
    isLocked: (): boolean => true,
    allowLayerChanges: false,
    traceClearance: 0.1,
    viaClearance: 0.1,
    pathHeuristicWeight: 3,
    maxPathSearchNodes: 30000,
    maxPathSearchCalls: 8,
  }
  const fine = negotiateTraceClearance(input)
  const coarse = negotiateTraceClearance({ ...input, pathGridSizeScale: 2 })
  for (const result of [fine, coarse]) {
    expect(result.unresolvedSpanCount).toBe(0)
    expect(result.routes[0]!.route).not.toEqual(routes[0]!.route)
    expect(result.routes[0]!.route[0]).toEqual(routes[0]!.route[0])
    expect(result.routes[0]!.route.at(-1)).toEqual(routes[0]!.route.at(-1))
    expect(getFixedObstacleViolations({ srj, routes: result.routes })).toEqual([])
  }
  expect(coarse.pathSearchNodes).toBeLessThan(fine.pathSearchNodes)
  for (const scale of [0, -1, Infinity, NaN]) {
    expect(() =>
      negotiateTraceClearance({ ...input, pathGridSizeScale: scale }),
    ).toThrow("path grid scale must be positive and finite")
  }
})
