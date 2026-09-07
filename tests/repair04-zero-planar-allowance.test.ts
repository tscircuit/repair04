import { expect, test } from "bun:test"
import { Repair04Solver } from "../lib/Repair04Solver"
import { createCrossingPairInput } from "./fixtures/crossing-pair"

test("zero planar allowance skips the expensive planar generator", (): void => {
  const input = createCrossingPairInput()
  input.maxCandidates = 3
  const solver = new Repair04Solver(input)
  const access = solver as unknown as {
    generateCandidates(): Generator<unknown>
    generateCandidatesForMode(allowLayerChanges: boolean): Generator<never>
  }
  const modes: boolean[] = []
  access.generateCandidatesForMode = function* (mode: boolean): Generator<never> {
    modes.push(mode)
  }
  expect([...access.generateCandidates()]).toHaveLength(0)
  expect(modes).toEqual([true])
})
