import { expect, test } from "bun:test"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"
import { sameNetViaPocket } from "./fixtures/sameNetViaPocket"

test("projection may approach its own pad without letting the via annulus overlap copper", (): void => {
  const { srj, route } = sameNetViaPocket()
  const result = relaxTraceClearance({
    srj,
    routes: [
      route,
      {
        ...route,
        connectionName: "fixed-foreign",
        rootConnectionName: "fixed-foreign",
        route: [
          { x: 0.45, y: -0.2, z: 0 },
          { x: 0.45, y: 0.2, z: 0 },
        ],
        vias: [],
      },
    ],
    bounds: srj.bounds,
    boundaryMargin: 0,
    lockedPointIndices: [
      [true, false, false, true],
      [true, true],
    ],
    allowViaMovement: true,
  })
  expect(result[0]!.vias[0]!.x).toBeCloseTo(0.15, 10)
  expect(result[0]!.route.map((point) => point.z)).toEqual(
    route.route.map((point) => point.z),
  )
  expect(result[0]!.route[0]).toEqual(route.route[0])
  expect(result[0]!.route.at(-1)).toEqual(route.route.at(-1))
})
