import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"

test("Game Boy clearance projection preserves terminals, layers and widths", (): void => {
  // Unrounded trace sections from the first divergent Game Boy projection.
  // The manual Linux/Mac workflow compares the complete output exactly.
  const input: Parameters<typeof relaxTraceClearance>[0] = JSON.parse(
    readFileSync(
      new URL("./fixtures/gameboy-clearance-projection.json", import.meta.url),
      "utf8",
    ),
  )
  const before = structuredClone(input)
  const output = relaxTraceClearance(input)
  expect(input).toEqual(before)
  expect(output).not.toEqual(input.routes)
  expect(output).toHaveLength(input.routes.length)
  for (const [index, route] of output.entries()) {
    const original = input.routes[index]!
    expect(route.route[0]).toEqual(original.route[0])
    expect(route.route.at(-1)).toEqual(original.route.at(-1))
    expect(route.route.map((point) => point.z)).toEqual(
      original.route.map((point) => point.z),
    )
    expect(route.route.map((point) => point.traceThickness)).toEqual(
      original.route.map((point) => point.traceThickness),
    )
    expect(route.traceThickness).toBe(original.traceThickness)
    expect(route.viaDiameter).toBe(original.viaDiameter)
  }
})
