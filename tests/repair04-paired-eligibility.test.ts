import { expect, test } from "bun:test"
import {
  createCrossingPairAccess,
  createCrossingPairInput,
} from "./fixtures/crossing-pair"

test("paired search requires an indexed same-layer crossing between the exact two routes", (): void => {
  const input = createCrossingPairInput()
  const positive = createCrossingPairAccess(input)
  expect(positive.generateCrossingPairCandidates().next().done).toBe(false)
  expect(positive.coupledPathSearchCalls).toBe(1)
  const wrongId = createCrossingPairAccess(input)
  wrongId.score.errors = wrongId.score.errors.map(
    (error): Record<string, unknown> => ({
      ...error,
      pcb_trace_error_id: "overlap_repair04_0_repair04_9",
    }),
  )
  expect([...wrongId.generateCrossingPairCandidates()]).toHaveLength(0)
  expect(wrongId.coupledPathSearchCalls).toBe(0)
  const wrongLayerInput = createCrossingPairInput()
  wrongLayerInput.routes[1]!.route = wrongLayerInput.routes[1]!.route.map(
    (point) => ({ ...point, z: 1 }),
  )
  const wrongLayer = createCrossingPairAccess(wrongLayerInput)
  expect([...wrongLayer.generateCrossingPairCandidates()]).toHaveLength(0)
  expect(wrongLayer.coupledPathSearchCalls).toBe(0)
  const sameNetInput = createCrossingPairInput()
  sameNetInput.routes[0]!.rootConnectionName = "common"
  sameNetInput.routes[1]!.rootConnectionName = "common"
  const sameNet = createCrossingPairAccess(sameNetInput)
  expect([...sameNet.generateCrossingPairCandidates()]).toHaveLength(0)
  expect(sameNet.coupledPathSearchCalls).toBe(0)
})
