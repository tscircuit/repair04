import { expect, test } from "bun:test"
import { NegotiateTraceClearanceSolver } from "../lib/NegotiateTraceClearanceSolver"
import { PairedClearancePathSolver } from "../lib/PairedClearancePathSolver"
import { makeBudgetInput, makeBudgetRoute } from "./fixtures/workBudgetFixture"

test("negotiation reserves both requested directions within the total work budget", (): void => {
  const routes = [
    makeBudgetRoute("blocked", [
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
      width: 0.5,
      height: 20,
      layers: ["top"],
      connectedTo: ["wall"],
    },
  ]
  for (const nodes of [1, 2, 3, 101]) {
    for (const calls of [1, 2]) {
      const input = {
        srj,
        routes,
        bounds,
        dirtyRouteIndices: [0],
        isLocked: (): boolean => true,
        allowLayerChanges: false,
        traceClearance: 0.1,
        viaClearance: 0.1,
        maxPathSearchNodes: nodes,
        maxPathSearchNodesPerCall: nodes,
        maxPathSearchCalls: calls,
        searchDirectionCount: 2 as const,
      }
      const solver = new NegotiateTraceClearanceSolver(input)
      let checked = false
      while (!solver.solved && !solver.failed) {
        solver.step()
        const child = solver.activeSubSolver
        if (!(child instanceof PairedClearancePathSolver) || checked) continue
        checked = true
        const forward = child.input.task.pathInput.maxNodes!
        const reverse = child.input.reverseMaxNodes ?? 0
        expect(forward + reverse).toBeLessThanOrEqual(nodes)
        if (nodes >= 2 && calls >= 2) {
          expect(forward).toBe(Math.ceil(nodes / 2))
          expect(reverse).toBe(Math.floor(nodes / 2))
        } else expect(reverse).toBe(0)
      }
      expect(checked).toBeTrue()
      expect(solver.failed).toBeFalse()
      const result = solver.getOutput()
      expect(result.pathSearchNodes).toBeLessThanOrEqual(nodes)
      expect(result.pathSearchCalls).toBeLessThanOrEqual(calls)
      expect(result.unresolvedSpanCount).toBe(1)
      expect(result.routes).toEqual(routes)
    }
  }
})
