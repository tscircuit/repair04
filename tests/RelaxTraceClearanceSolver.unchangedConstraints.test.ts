import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import {
  relaxTraceClearance,
  type RelaxTraceClearanceInput,
} from "../lib/relaxTraceClearance"

test("unchanged constraints retain coupled projection and sweep accounting", (): void => {
  const fixture: RelaxTraceClearanceInput = JSON.parse(
    readFileSync(
      new URL("./fixtures/gameboy-clearance-projection.json", import.meta.url),
      "utf8",
    ),
  )
  for (const locking of ["original", "locked", "alternating"]) {
    const input = structuredClone(fixture)
    if (locking !== "original") {
      input.lockedPointIndices = input.routes.map((route): boolean[] =>
        route.route.map((_, index): boolean =>
          locking === "locked" ? true : index % 2 === 0,
        ),
      )
    }
    const before = structuredClone(input)
    const solver = new RelaxTraceClearanceSolver(input)
    solver.solve()
    expect(solver.failed).toBeFalse()
    expect(solver.getOutput()).toEqual(relaxTraceClearance(input))
    expect(input).toEqual(before)
    expect(solver.stats.sweepCount).toBe(256)
    expect(solver.stats.projectedConstraintCount).toBe(
      256 * (solver.stats.pairCount + solver.stats.padContactCount),
    )
    if (locking === "original") {
      expect(solver.getOutput()).not.toEqual(input.routes)
    }
  }
})
