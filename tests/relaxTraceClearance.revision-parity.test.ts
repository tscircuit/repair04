import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import type { RelaxTraceClearanceInput } from "../lib/relaxTraceClearance"
import golden from "./fixtures/clearance-projection-revisions.json"

test("revision-cached projections retain exact clearance repro geometry and work budgets", (): void => {
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
    expect(solver.iterations).toBe(expected.iterations)
    expect(solver.stats).toEqual(expected.stats)
    expect(input).toEqual(before)
  }
})
