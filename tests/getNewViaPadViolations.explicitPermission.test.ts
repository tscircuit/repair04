import { expect, test } from "bun:test"
import {
  createNewViaPadViolationEvaluator,
  getNewViaPadViolations,
} from "../lib/getNewViaPadViolations"
import { newViaPadFixture } from "./fixtures/newViaPadFixture"

test("explicit via-in-pad permission requires full same-net SMT copper containment", (): void => {
  for (const type of ["rect", "oval"] as const) {
    for (const angle of [0, 37, 135]) {
      const input = newViaPadFixture()
      const pad = input.srj.obstacles[0]!
      pad.kind = "smt_pad"
      // Electrical aliases can include other physical kinds on the same net.
      pad.connectedTo.push("pcb_plated_hole_same_net_alias")
      pad.type = type
      pad.width = 0.8
      pad.height = 0.6
      pad.ccwRotationDegrees = angle
      expect(getNewViaPadViolations(input)).toHaveLength(1)
      input.srj.allowViaInPad = false
      expect(getNewViaPadViolations(input)).toHaveLength(1)
      input.srj.allowViaInPad = true
      expect(getNewViaPadViolations(input)).toEqual([])

      const evaluator = createNewViaPadViolationEvaluator(input)
      expect(evaluator(input)).toEqual([])
      const foreign = structuredClone(input)
      foreign.routes[0]!.connectionName = "foreign"
      foreign.routes[0]!.rootConnectionName = "foreign-net"
      expect(evaluator(foreign)).toHaveLength(1)
      expect(evaluator(input)).toEqual([])

      const partial = structuredClone(input)
      const radians = (angle * Math.PI) / 180
      for (const point of partial.routes[0]!.route.slice(1, 3)) {
        point.x = -Math.sin(radians) * 0.2
        point.y = Math.cos(radians) * 0.2
      }
      expect(getNewViaPadViolations(partial)).toHaveLength(1)
      // A previously permitted annulus may not become a partial pad overlap,
      // even when unchanged topology proves that it is the same physical via.
      partial.previousRoutes = structuredClone(input.routes)
      expect(getNewViaPadViolations(partial)).toHaveLength(1)

      const blocked = structuredClone(input)
      blocked.srj.obstacles.push({
        ...structuredClone(pad),
        connectedTo: ["foreign", "pcb_smtpad_foreign"],
      })
      expect(getNewViaPadViolations(blocked)).toHaveLength(1)

      const throughHole = structuredClone(input)
      throughHole.srj.obstacles[0]!.layers = ["top", "bottom"]
      expect(getNewViaPadViolations(throughHole)).toHaveLength(1)
      const unrecognized = structuredClone(input)
      delete unrecognized.srj.obstacles[0]!.kind
      expect(getNewViaPadViolations(unrecognized)).toHaveLength(1)
      unrecognized.srj.obstacles[0]!.kind = "plated_hole"
      expect(getNewViaPadViolations(unrecognized)).toHaveLength(1)
      unrecognized.srj.obstacles[0]!.kind = "via"
      expect(getNewViaPadViolations(unrecognized)).toHaveLength(1)
    }
  }
})
