import { expect, test } from "bun:test"
import "bun-match-svg"
import fixture from "./fixtures/pmp22650-bounded-region.json"
import {
  renderClearanceRepro,
  type ClearanceVisualReproFixture,
} from "./fixtures/renderClearanceRepro"
import { NegotiateTraceClearanceSolver } from "../lib/NegotiateTraceClearanceSolver"
import type { NegotiatedClearanceInput } from "../lib/negotiateTraceClearance"

type Pmp22650Fixture = Omit<NegotiatedClearanceInput, "isLocked"> & {
  lockedPointIndices: boolean[][]
}

test("PMP22650 bounded repair completes with dense path state", async (): Promise<void> => {
  const capturedInput = fixture as Pmp22650Fixture
  const solver = new NegotiateTraceClearanceSolver({
    ...capturedInput,
    isLocked: (routeIndex, pointIndex): boolean =>
      capturedInput.lockedPointIndices[routeIndex]![pointIndex]!,
  })

  while (!solver.solved && !solver.failed) solver.step()

  expect(solver.failed).toBeFalse()
  expect(solver.stats.pathSearchCalls).toBe(361)
  expect(solver.stats.pathSearchNodes).toBe(323_518)
  const output = solver.getOutput()
  expect(output.unresolvedSpanCount).toBe(0)
  expect(output.routes).toHaveLength(capturedInput.routes.length)
  for (const [routeIndex, route] of output.routes.entries()) {
    for (const [pointIndex, locked] of capturedInput.lockedPointIndices[
      routeIndex
    ]!.entries()) {
      if (locked)
        expect(route.route).toContainEqual(
          capturedInput.routes[routeIndex]!.route[pointIndex]!,
        )
    }
  }

  const visualFixture: ClearanceVisualReproFixture = {
    name: "pmp22650-bounded-region",
    title: "PMP22650: bounded repair completes",
    provenance: "TI PMP22650 · dataset-srj24 sample 24 · bounded repair region",
    viewport: capturedInput.bounds,
    input: {
      srj: capturedInput.srj,
      routes: capturedInput.routes,
      bounds: capturedInput.bounds,
      lockedPointIndices: capturedInput.lockedPointIndices,
      traceClearance: capturedInput.traceClearance,
      viaClearance: capturedInput.viaClearance,
      allowViaMovement: capturedInput.allowLayerChanges,
      boundaryMargin: 0,
    },
  }
  await expect(
    renderClearanceRepro(visualFixture, output.routes, "After dense search"),
  ).toMatchSvgSnapshot(import.meta.path)
})
