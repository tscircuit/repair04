import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import { NegotiateTraceClearanceSolver } from "../lib/NegotiateTraceClearanceSolver"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"

test("a search limit does not turn unresolved movable copper into a hard obstacle", (): void => {
  const routes: HighDensityRoute[] = [
    {
      connectionName: "horizontal",
      traceThickness: 0.2,
      viaDiameter: 0.4,
      vias: [],
      route: [
        { x: -4, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
      ],
    },
    {
      connectionName: "vertical",
      traceThickness: 0.2,
      viaDiameter: 0.4,
      vias: [],
      route: [
        { x: 0, y: -4, z: 0 },
        { x: 0, y: 4, z: 0 },
      ],
    },
  ]
  const bounds = { minX: -6, maxX: 6, minY: -6, maxY: 6 }
  const input = {
    srj: {
      bounds,
      layerCount: 2,
      minTraceWidth: 0.2,
      connections: [],
      obstacles: [
        {
          type: "rect" as const,
          center: { x: 0, y: 0 },
          width: 1,
          height: 1,
          layers: ["top" as const],
          connectedTo: ["fixed-pad"],
        },
      ],
    },
    routes,
    bounds,
    dirtyRouteIndices: [0, 1],
    isLocked: (ri: number, pi: number): boolean =>
      pi === 0 || pi === routes[ri]!.route.length - 1,
    allowLayerChanges: true,
    traceClearance: 0.1,
    viaClearance: 0.1,
    maxPathSearchNodes: 2,
    maxPathSearchNodesPerCall: 1,
    maxPathSearchCalls: 2,
  }
  const solver = new NegotiateTraceClearanceSolver(input)
  let checkedSecondSearch = false
  while (!solver.solved && !solver.failed) {
    solver.step()
    const search = solver.activeSubSolver
    if (!(search instanceof FindClearancePathSolver)) continue
    const selected = search.input.routes[search.input.routeIndex]!
    if (selected.connectionName !== "vertical") continue
    expect(solver.stats.pathSearchCalls).toBe(1)
    // Terminal sites stay fixed. The exhausted horizontal span itself must
    // remain in the soft congestion model, rather than the hard route list.
    const horizontalAnchors = search.input.routes.filter(
      (route) => route.connectionName === "horizontal",
    )
    expect(horizontalAnchors.length).toBeGreaterThan(0)
    for (const anchor of horizontalAnchors)
      expect(anchor.route[0]).toEqual(anchor.route.at(-1))
    checkedSecondSearch = true
  }
  expect(checkedSecondSearch).toBeTrue()
  expect(solver.failed).toBeFalse()
  const result = solver.getOutput()
  expect(result.unresolvedSpanCount).toBe(2)
  expect(result.pathSearchNodes).toBe(2)
  expect(result.routes).toEqual(routes)
  expect(negotiateTraceClearance(input)).toEqual(result)
})
