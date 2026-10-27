import { expect, test } from "bun:test"
import { AutoroutingDrcEngine } from "high-density-repair03/lib"
import { NegotiateTraceClearanceSolver } from "../lib/NegotiateTraceClearanceSolver"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"
import type { NegotiatedClearanceTaskEvent } from "../lib/negotiateTraceClearance"
import { negotiationInput } from "./fixtures/repair04StepFixtures"

test("a victim is rechecked after blocker edits and avoids a fresh path search", (): void => {
  const original = structuredClone(negotiationInput.routes)
  const baseline = new NegotiateTraceClearanceSolver(negotiationInput)
  baseline.solve()
  const events: NegotiatedClearanceTaskEvent[] = []
  const solver = new NegotiateTraceClearanceSolver({
    ...negotiationInput,
    useCausalWorklist: true,
    onWorklistTask: (event): void => {
      events.push(event)
    },
  })
  solver.solve()
  expect(solver.failed).toBeFalse()
  const result = solver.getOutput()
  expect(solver.stats.cleanRechecks).toBeGreaterThan(0)
  expect(result.pathSearchCalls).toBeLessThan(
    baseline.getOutput().pathSearchCalls,
  )
  expect(result.pathSearchNodes).toBeLessThanOrEqual(
    baseline.getOutput().pathSearchNodes,
  )
  const clear = events.find(
    (event): boolean => event.action === "recheck-clear",
  )!
  expect(clear.task.kind).toBe("recheck")
  expect(clear.currentRevision).toBe(clear.task.revision)
  expect(clear.task.cause?.revision).toBeGreaterThan(0)
  expect(
    events.some(
      (event): boolean =>
        event.action === "queued" &&
        event.task.kind === "reroute" &&
        event.task.spanIndex !== 0 &&
        event.task.cause?.spanIndex === 0 &&
        event.task.cause.revision > 0,
    ),
  ).toBeTrue()
  expect(
    result.routes.some(
      (route, index): boolean =>
        index !== 0 && route.route.length > original[index]!.route.length,
    ),
  ).toBeTrue()
  const engine = new AutoroutingDrcEngine(negotiationInput.srj, {
    traceClearance: 0.1,
    viaClearance: 0.1,
  })
  expect(
    engine.evaluate(convertRepairRoutesToTraces(result.routes, 1)).errors,
  ).toHaveLength(0)
  expect(
    getFixedObstacleViolations({
      srj: negotiationInput.srj,
      routes: result.routes,
    }),
  ).toHaveLength(0)
  expect(
    getNewViaPadViolations({
      srj: negotiationInput.srj,
      previousRoutes: original,
      routes: result.routes,
    }),
  ).toHaveLength(0)
  expect(negotiationInput.routes).toEqual(original)
  for (let index = 0; index < original.length; index++) {
    expect(result.routes[index]!.route[0]).toEqual(original[index]!.route[0])
    expect(result.routes[index]!.route.at(-1)).toEqual(
      original[index]!.route.at(-1),
    )
  }
})
