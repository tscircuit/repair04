import { expect, test } from "bun:test"
import { findClearancePath } from "../lib/findClearancePath"
import { sameNetViaPocket } from "./fixtures/sameNetViaPocket"

test("a via can use a narrow pocket outside its own pad while clearing foreign copper", (): void => {
  for (const offset of [0, 13.123]) {
    const { srj, route } = sameNetViaPocket(offset)
    const params = {
      srj,
      routes: [route],
      routeIndex: 0,
      start: route.route[0]!,
      end: route.route.at(-1)!,
      bounds: srj.bounds,
      traceThickness: 0.1,
      traceClearance: 0.1,
      viaClearance: 0.1,
      viaHoleDiameter: 0.15,
      maxNodes: 1000,
    }
    const path = findClearancePath(params)
    expect(path).not.toBeNull()
    const transitions = path!.filter(
      (point, i) => i > 0 && point.z !== path![i - 1]!.z,
    )
    expect(transitions).toHaveLength(1)
    expect(transitions[0]!.x - offset).toBeGreaterThanOrEqual(0.15 - 1e-8)
    expect(transitions[0]!.x - offset).toBeLessThanOrEqual(0.17 + 1e-8)
    srj.minViaEdgeToPadEdgeClearance = 0.1
    expect(findClearancePath(params)).toBeNull()
  }
})
