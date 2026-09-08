import { expect, test } from "bun:test"
import {
  createCrossingPairAccess,
  createCrossingPairInput,
} from "./fixtures/crossing-pair"

test("paired search preserves locked bend groups and existing via anchors", (): void => {
  for (const member of [0, 1]) {
    const input = createCrossingPairInput()
    input.lockedPointIndices[member] = input.lockedPointIndices[member]!.map(
      (): boolean => true,
    )
    const access = createCrossingPairAccess(input)
    expect([...access.generateCrossingPairCandidates()]).toHaveLength(0)
    expect(access.coupledPathSearchCalls).toBe(0)
  }
})
