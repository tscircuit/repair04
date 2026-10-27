import { expect, test } from "bun:test"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"
import { negotiationInput } from "./fixtures/repair04StepFixtures"

test("an exhausted causal budget retains unresolved proposals without searching", (): void => {
  for (const budget of [
    { maxPathSearchNodes: 0, maxPathSearchCalls: 4 },
    { maxPathSearchNodes: 100, maxPathSearchCalls: 0 },
  ]) {
    let searches = 0
    const result = negotiateTraceClearance({
      ...negotiationInput,
      ...budget,
      useCausalWorklist: true,
      onSearch: (): void => {
        searches++
      },
    })
    expect(searches).toBe(0)
    expect(result.routes).toEqual(negotiationInput.routes)
    expect(result.unresolvedSpanCount).toBe(1)
    expect(result.pathSearchCalls).toBe(0)
    expect(result.pathSearchNodes).toBe(0)
  }
})
