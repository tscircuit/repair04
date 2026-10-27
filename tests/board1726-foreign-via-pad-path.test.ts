import { beforeAll, expect, test } from "bun:test"
import "bun-match-svg"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { getRepairRouteVias } from "../lib/getRepairRouteVias"
import {
  createNegotiatedClearanceSearch,
  type NegotiatedClearanceSearchInput,
} from "../lib/negotiatedClearanceSearchKernel"
import {
  measureClearanceRepro,
  renderClearanceRepro,
  type ClearanceVisualReproFixture,
} from "./fixtures/renderClearanceRepro"

type RealPathFixture = {
  source: {
    taskSha256: string
    sourceFixtureSha256: string
    connectionName: string
    verification: { ownershipAliasesCompared: number }
  }
  task: NegotiatedClearanceSearchInput & {
    pathInput: NegotiatedClearanceSearchInput["pathInput"] & {
      srj: NegotiatedClearanceSearchInput["pathInput"]["srj"] & {
        minPadEdgeToPadEdgeClearance: number
      }
    }
  }
}

const fixture: RealPathFixture = JSON.parse(
  gunzipSync(
    new Uint8Array(
      readFileSync(
        new URL(
          "./fixtures/board1726/foreign-via-pad-path.json.gz",
          import.meta.url,
        ),
      ),
    ),
  ).toString("utf8"),
)
const task = structuredClone(fixture.task)
const original = structuredClone(task)
const input = task.pathInput
const selected = input.routes[input.routeIndex]!
const solver = createNegotiatedClearanceSearch(task)
let candidate: HighDensityRoute

const visual: ClearanceVisualReproFixture = {
  name: "board1726-foreign-via-pad-path",
  title: "Board1726: route the real branch with 0.15 mm foreign-pad clearance",
  provenance:
    "Original 14-point path · 14 pads · 47 fixed route pieces · 69 copper pieces",
  viewport: input.bounds,
  viaToPadClearance: input.srj.minPadEdgeToPadEdgeClearance,
  input: {
    srj: input.srj,
    routes: input.routes,
    bounds: input.bounds,
    boundaryMargin: 0,
    lockedPointIndices: input.routes.map((route) =>
      route.route.map(
        (_, index) => index === 0 || index === route.route.length - 1,
      ),
    ),
    traceClearance: input.traceClearance,
    viaClearance: input.viaClearance,
    allowViaMovement: true,
  },
}

beforeAll(async (): Promise<void> => {
  expect(createHash("sha256").update(JSON.stringify(task)).digest("hex")).toBe(
    fixture.source.taskSha256,
  )
  expect(fixture.source.sourceFixtureSha256).toBe(
    "273bab3643a859a0ac394677f0fe95ea5b0f8e2a7b4b4ac37ae700201f0a3fb7",
  )
  expect(selected.connectionName).toBe(fixture.source.connectionName)
  expect(fixture.source.verification.ownershipAliasesCompared).toBe(841)
  expect(input.existingPath).toHaveLength(14)
  expect(input.srj.obstacles).toHaveLength(14)
  expect(input.routes).toHaveLength(47)
  expect(task.coppers).toHaveLength(69)
  expect(input.srj.minPadEdgeToPadEdgeClearance).toBe(0.15)
  expect(input.srj.minViaEdgeToPadEdgeClearance).toBeUndefined()
  solver.solve()
  expect(solver.solved).toBeTrue()
  expect(solver.failed).toBeFalse()
  const route = solver.getOutput()
  if (!route) throw new Error("Board1726 path search returned no route")
  candidate = { ...selected, route, vias: [] }
  candidate.vias = getRepairRouteVias({
    route: candidate,
    mutableBounds: input.bounds,
  })
  const renderedRoutes = input.routes.map((route, index) =>
    index === input.routeIndex ? candidate : route,
  )
  await expect(renderClearanceRepro(visual, renderedRoutes)).toMatchSvgSnapshot(
    import.meta.path,
  )
})

test("Board1726 replaces the original path that crowds two foreign pads", (): void => {
  expect(task).toEqual(original)
  expect(candidate.route[0]).toEqual(input.start)
  expect(candidate.route.at(-1)).toEqual(input.end)
  expect(candidate.vias).toHaveLength(1)
  const originalBranch = {
    ...selected,
    route: input.existingPath!,
    vias: selected.vias,
  }
  expect(measureClearanceRepro(visual, [originalBranch]).drcErrorCount).toBe(2)
  expect(measureClearanceRepro(visual, [candidate]).drcErrorCount).toBe(0)
  expect(candidate.route).not.toEqual(input.existingPath)
  expect(solver.stats.nodesPopped).toBeLessThanOrEqual(input.maxNodes!)
})
