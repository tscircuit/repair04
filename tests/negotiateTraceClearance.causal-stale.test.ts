import { expect, test } from "bun:test"
import { AutoroutingDrcEngine, type HighDensityRoute } from "high-density-repair03/lib"
import { NegotiateTraceClearanceSolver } from "../lib/NegotiateTraceClearanceSolver"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"
import type { NegotiatedClearanceTaskEvent } from "../lib/negotiateTraceClearance"
import { negotiationInput } from "./fixtures/repair04StepFixtures"

test("an aggressor supersedes a waiting victim recheck without losing its reroute", (): void => {
  const events: NegotiatedClearanceTaskEvent[] = []
  const routes = [0, 0.21, -0.21, 0.42, -0.42].map((y, index): HighDensityRoute => ({
    ...negotiationInput.routes[0]!,
    connectionName: `track${index}`,
    route: [{ x: -4.5, y, z: 0 }, { x: 4.5, y, z: 0 }],
  }))
  const solver = new NegotiateTraceClearanceSolver({
    ...negotiationInput,
    routes,
    dirtyRouteIndices: [0, 1, 2, 3, 4],
    pathGridSizeScale: 2,
    pathHeuristicWeight: 3,
    useCausalWorklist: true,
    onWorklistTask: (event): void => { events.push(event) },
  })
  solver.solve()
  expect(solver.failed).toBeFalse()
  const stale = events.filter((event): boolean => event.action === "stale")
  expect(stale.length).toBeGreaterThan(0)
  for (const event of stale) {
    expect(event.task.kind).toBe("recheck")
    const index = events.indexOf(event)
    expect(events.some((candidate, ci): boolean => ci > index && candidate.task.spanIndex === event.task.spanIndex && candidate.action === "reroute")).toBeTrue()
  }
  expect(solver.getOutput().unresolvedSpanCount).toBe(0)
  const engine = new AutoroutingDrcEngine(negotiationInput.srj, { traceClearance: 0.1, viaClearance: 0.1 })
  expect(engine.evaluate(convertRepairRoutesToTraces(solver.getOutput().routes, 1)).errors).toHaveLength(0)
})
