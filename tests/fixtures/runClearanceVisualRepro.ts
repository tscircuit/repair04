import type { HighDensityRoute } from "high-density-repair03/lib"
import { relaxTraceClearance } from "../../lib/relaxTraceClearance"
import type { ClearanceVisualReproFixture } from "./renderClearanceRepro"

/** Record the existing projection behavior before the incremental fix. */
export function runClearanceVisualRepro(
  fixture: ClearanceVisualReproFixture,
): HighDensityRoute[] {
  return relaxTraceClearance(fixture.input)
}
