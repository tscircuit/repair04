import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { extractRepairRegion, Repair04Solver } from "lib/index"
import {
  nearCrossingBounds,
  nearCrossingRoutes,
  nearCrossingSrj,
} from "tests/fixtures/near-crossing"

export default (
  <GenericSolverDebugger
    createSolver={() =>
      new Repair04Solver(
        extractRepairRegion({
          srj: nearCrossingSrj,
          routes: nearCrossingRoutes,
          bounds: nearCrossingBounds,
        }),
      )
    }
  />
)
