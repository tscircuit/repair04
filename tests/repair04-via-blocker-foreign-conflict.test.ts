import { expect, test } from "bun:test"
import { createViaBlockerFixture } from "./fixtures/createViaBlockerFixture"

test("unclassified moved-via conflicts cannot trigger coupled repair", (): void => {
  for (const additionalError of [
    {
      type: "pcb_trace_error",
      pcb_trace_error_id: "via_via_overlap_via_0_via_1",
      pcb_via_ids: ["via_0", "via_1"],
    },
    {
      type: "future_via_clearance_error",
      pcb_via_id: "via_0",
    },
  ]) {
    const { solver, selected, candidate } = createViaBlockerFixture()
    expect(candidate.evaluatedScore.errors).toHaveLength(1)
    expect(candidate.evaluatedScore.errors[0].pcb_via_id).toBe("via_0")
    candidate.evaluatedScore = {
      ...candidate.evaluatedScore,
      count: candidate.evaluatedScore.count + 1,
      errors: [...candidate.evaluatedScore.errors, additionalError],
    }
    solver.evaluate = (): never => {
      throw new Error("Coupling must reuse the existing candidate score")
    }
    expect(Array.from(solver.generateViaBlockerCandidates(
      selected, candidate,
    ))).toEqual([])
    expect(solver.viaBlockerPathSearchCalls).toBe(0)
    expect(solver.pathSearchCalls).toBe(0)
    expect(solver.pathSearchNodes).toBe(0)
  }
})
