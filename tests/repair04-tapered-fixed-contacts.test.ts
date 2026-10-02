import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib"
import { makeTaperedClearanceInput } from "./fixtures/taperedClearanceFixture"

type Access = {
  generateTaperedSegmentCandidates(
    targets: { ri: number; pi: number; distance: number; t: number }[],
  ): Generator<{ routeIndex: number; route: HighDensityRoute }>
}

test("tapered translations preserve locked contacts, ports, junctions and vias", (): void => {
  for (const kind of ["lock", "port", "junction", "via", "endpoint"]) {
    const input = makeTaperedClearanceInput()
    const route = input.routes[0]!
    let pi = 2
    if (kind === "lock") input.lockedPointIndices[0]![1] = true
    if (kind === "port") route.route[1]!.pcb_port_id = "fixed-port"
    if (kind === "junction")
      Object.assign(route.route[1]!, { portPointId: "fixed-junction" })
    if (kind === "via") {
      const point = route.route[1]!
      route.route.splice(2, 0, { ...point, z: 1 })
      route.route[3]!.z = 1
      route.route[4]!.z = 1
      route.vias = [{ x: point.x, y: point.y }]
      input.lockedPointIndices[0]!.splice(2, 0, false)
      pi = 3
    }
    if (kind === "endpoint") pi = 1
    const solver = new Repair04Solver(input)
    solver.step()
    const before = structuredClone(input.routes)
    const candidates = [
      ...(solver as unknown as Access).generateTaperedSegmentCandidates([
        { ri: 0, pi, distance: 0, t: 0.5 },
      ]),
    ]
    expect(candidates).toEqual([])
    expect(input.routes).toEqual(before)
  }
})
