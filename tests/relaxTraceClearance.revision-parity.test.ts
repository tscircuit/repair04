import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import type { RelaxTraceClearanceInput } from "../lib/relaxTraceClearance"
import golden from "./fixtures/clearance-projection-revisions.json"

test("indexed projections retain exact clearance repro geometry within legacy work bounds", (): void => {
  // Captured from the pre-optimization stepped solver, including blocked vias,
  // moving interior pad contacts, shared vertices and coupled route constraints.
  const directory = new URL("./fixtures/clearance-repros/", import.meta.url)
  for (const [name, expected] of Object.entries(golden)) {
    const input: RelaxTraceClearanceInput = JSON.parse(
      readFileSync(new URL(name, directory), "utf8"),
    ).input
    const before = structuredClone(input)
    const solver = new RelaxTraceClearanceSolver(input)
    solver.solve()
    expect(solver.solved).toBeTrue()
    expect(solver.failed).toBeFalse()
    expect(
      createHash("sha256")
        .update(JSON.stringify(solver.getOutput()))
        .digest("hex"),
    ).toBe(expected.sha256)
    expect(solver.iterations).toBeLessThanOrEqual(expected.iterations)
    for (const count of [
      "preparedPairCount",
      "pairCount",
      "padContactCount",
      "projectedConstraintCount",
    ] as const) {
      expect(solver.stats[count]).toBeLessThanOrEqual(expected.stats[count])
    }
    expect(solver.stats.sweepCount).toBe(expected.stats.sweepCount)
    expect(solver.stats.preparedObstacleCount).toBe(
      expected.stats.preparedObstacleCount,
    )
    expect(solver.stats.lastPreparedPairBatchCount).toBeLessThanOrEqual(4096)
    expect(solver.stats.lastProjectedConstraintBatchCount).toBeLessThanOrEqual(
      4096,
    )
    expect(input).toEqual(before)
  }
})
