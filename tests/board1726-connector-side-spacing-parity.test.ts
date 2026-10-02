import { expect, test } from "bun:test"
import "bun-match-svg"
import fixtureData from "./fixtures/clearance-repros/board1726-connector-side-spacing-parity.json"
import {
  renderClearanceRepro,
  type ClearanceVisualReproFixture,
} from "./fixtures/renderClearanceRepro"
import { runClearanceVisualRepro } from "./fixtures/runClearanceVisualRepro"

test("Board1726: connector-side spacing stays repaired", async (): Promise<void> => {
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
