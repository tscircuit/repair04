import { expect, test } from "bun:test"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"
import { getRepairViaGeometry } from "../lib/getRepairViaGeometry"
import { newViaPadFixture } from "./fixtures/newViaPadFixture"

test("physical via guards use board policy for copper beyond route endpoints", (): void => {
  for (const layerCount of [4, 6]) {
    for (const allowBlindAndBuriedVias of [undefined, false, true]) {
      const { srj, previousRoutes, routes } = newViaPadFixture()
      srj.layerCount = layerCount
      const policySrj = { ...srj, allowBlindAndBuriedVias }
      srj.obstacles[0]!.layers = ["bottom"]
      srj.obstacles[0]!.connectedTo = ["foreign-net"]
      for (const point of routes[0]!.route) if (point.z === 1) point.z = 2
      const before = structuredClone(routes)
      expect(
        getRepairViaGeometry(
          routes[0]!,
          layerCount,
          allowBlindAndBuriedVias,
        )[0],
      ).toMatchObject({
        minZ: 0,
        maxZ: allowBlindAndBuriedVias ? 2 : layerCount - 1,
      })
      expect(
        getNewViaPadViolations({ srj: policySrj, previousRoutes, routes }),
      ).toHaveLength(allowBlindAndBuriedVias ? 0 : 1)
      expect(
        getFixedObstacleViolations({ srj: policySrj, routes }),
      ).toHaveLength(allowBlindAndBuriedVias ? 0 : 1)
      expect(routes).toEqual(before)
    }
  }
})
