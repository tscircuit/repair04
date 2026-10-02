import type { HighDensityRoute } from "high-density-repair03/lib"
import { RelaxTraceClearanceSolver } from "../../lib/RelaxTraceClearanceSolver"
import type { ClearanceVisualReproFixture } from "./renderClearanceRepro"

/** Drive the top-level projection solver while retaining its child state. */
export function runClearanceVisualRepro(
  fixture: ClearanceVisualReproFixture,
): HighDensityRoute[] {
  const solver = new RelaxTraceClearanceSolver(fixture.input)
  while (!solver.solved && !solver.failed) solver.step()
  if (solver.failed || !solver.solved) {
    throw new Error(`Clearance repro failed: ${solver.error}`)
  }
  return solver.getOutput()
}
