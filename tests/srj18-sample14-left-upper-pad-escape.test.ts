import { expect, test } from "bun:test"
import "bun-match-svg"
import fixtureData from "./fixtures/clearance-repros/srj18-sample14-left-upper-pad-escape.json"
import {
  renderClearanceRepro,
  type ClearanceVisualReproFixture,
} from "./fixtures/renderClearanceRepro"
import { runClearanceVisualRepro } from "./fixtures/runClearanceVisualRepro"

test("Sample 14: retain the repaired left BGA upper escape", async (): Promise<void> => {
  const fixture = fixtureData as ClearanceVisualReproFixture
  const original = structuredClone(fixture.input)
  const output = runClearanceVisualRepro(fixture)
  expect(fixture.input).toEqual(original)
  expect(output).toHaveLength(original.routes.length)
  for (const [routeIndex, route] of output.entries()) {
    for (const [pointIndex, locked] of original.lockedPointIndices[
      routeIndex
    ]!.entries()) {
      if (locked)
        expect(route.route[pointIndex]).toEqual(
          original.routes[routeIndex]!.route[pointIndex],
        )
    }
  }
  await expect(renderClearanceRepro(fixture, output)).toMatchSvgSnapshot(
    import.meta.path,
  )
})
