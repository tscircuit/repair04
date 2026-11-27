import { expect, test } from "bun:test"
import "bun-match-svg"
import { sharedViaClearanceFixture } from "./fixtures/sharedViaClearanceFixture"
import { measureClearanceRepro, renderClearanceRepro } from "./fixtures/renderClearanceRepro"
import { runClearanceVisualRepro } from "./fixtures/runClearanceVisualRepro"

test("projects shared power copper beside a fixed ground via", async (): Promise<void> => {
  const fixture = sharedViaClearanceFixture()
  const before = structuredClone(fixture.input)
  const output = runClearanceVisualRepro(fixture)
  expect(fixture.input).toEqual(before)
  expect(output).toHaveLength(before.routes.length)
  expect(output[2]).toEqual(before.routes[2])
  const measurements = measureClearanceRepro(fixture, output)
  expect(measurements.drcErrorCount).toBe(0)
  expect(measurements.targetViaTraceGap).toBeGreaterThanOrEqual(fixture.input.traceClearance - 1e-8)
  await expect(renderClearanceRepro(fixture, output)).toMatchSvgSnapshot(import.meta.path)
})
