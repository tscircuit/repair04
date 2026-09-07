import { expect, test } from "bun:test"
import { createCrossingPairAccess, createCrossingPairInput } from "./fixtures/crossing-pair"

test("paired path allowance is cumulative across generator restarts and shares the node cap", (): void => {
  const access = createCrossingPairAccess(createCrossingPairInput())
  for (let i = 0; i < 4; i++) {
    expect(access.generateCrossingPairCandidates().next().done).toBe(false)
    expect(access.coupledPathSearchCalls).toBe(i + 1)
  }
  const nodes = access.pathSearchNodes
  expect([...access.generateCrossingPairCandidates()]).toHaveLength(0)
  expect(access.pathSearchNodes).toBe(nodes)
  const input = createCrossingPairInput()
  input.maxPathSearchNodes = 1
  const limited = createCrossingPairAccess(input)
  expect([...limited.generateCrossingPairCandidates()]).toHaveLength(0)
  expect(limited.pathSearchNodes).toBe(1)
  expect(limited.coupledPathSearchCalls).toBe(1)
})
