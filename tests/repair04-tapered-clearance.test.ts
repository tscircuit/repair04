import { expect, test } from "bun:test"
import { AutoroutingDrcEngine } from "high-density-repair03/lib"
import { Repair04Solver, convertRepairRoutesToTraces, getNewViaPadViolations } from "../lib"
import { makeTaperedClearanceInput } from "./fixtures/taperedClearanceFixture"

test("two tapered bends clear a pad without moving attachments or narrowing copper", (): void => {
  const input = makeTaperedClearanceInput()
  const engine = new AutoroutingDrcEngine(input.srj)
  const before = engine.evaluate(convertRepairRoutesToTraces(input.routes, 2))
  expect(before.errors).toHaveLength(1)
  expect(before.errorsWithCenters[0]!.actual_clearance).toBeCloseTo(0.07584658521903134, 12)
  const solver = new Repair04Solver({ ...input, maxCandidateAttempts: 16 })
  solver.solve()
  const output = solver.getOutput()
  expect(solver.failed).toBe(false)
  expect(solver.stats.finalErrorCount).toBe(0)
  expect(solver.stats.candidateAttempts).toBe(1)
  expect(solver.stats.pathSearchCalls).toBe(0)
  expect(engine.evaluate(convertRepairRoutesToTraces(output, 2)).errors).toEqual([])
  const route = output[0]!.route
  expect(route).toHaveLength(4)
  expect(route[0]).toEqual(input.routes[0]!.route[0])
  expect(route[3]).toEqual(input.routes[0]!.route[3])
  for (const index of [1, 2]) {
    expect(route[index]).toEqual({ ...input.routes[0]!.route[index]!, x: input.routes[0]!.route[index]!.x + 0.1 })
  }
  expect(output[0]!.vias).toEqual([])
  expect(getNewViaPadViolations({ srj: input.srj, previousRoutes: input.routes, routes: output })).toEqual([])
})
