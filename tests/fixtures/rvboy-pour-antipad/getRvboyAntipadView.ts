import { getSvgFromGraphicsObject, type GraphicsObject } from "graphics-debug"
import type {
  ClearancePathInput,
  ClearancePathSearchStats,
} from "../../../lib/findClearancePath"
import source from "./source.json"

export function getRvboyAntipadView(
  input: ClearancePathInput,
  path: ClearancePathInput["start"][] | null,
  stats: ClearancePathSearchStats,
): string {
  const { minX, maxX, minY, maxY } = source.viewbox
  const target = input.routes[input.routeIndex]!
  const graphics: GraphicsObject = {
    coordinateSystem: "cartesian",
    rects: [
      {
        center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
        width: maxX - minX,
        height: maxY - minY,
        fill: "none",
        stroke: "none",
        label: "viewport",
      },
      ...input.srj.obstacles
        .filter((o) => o.isCopperPour || o.layers.includes("top"))
        .map((o) => ({
          center: o.center,
          width: o.width,
          height: o.height,
          fill: o.isCopperPour
            ? "rgba(134, 197, 150, 0.16)"
            : "rgba(148, 163, 184, 0.5)",
          stroke: "none",
        })),
    ],
    lines: input.routes.flatMap((route, ri) =>
      ri === input.routeIndex
        ? []
        : route.route.slice(1).flatMap((point, i) => {
            const previous = route.route[i]!
            if (point.z !== previous.z || ![0, 3].includes(point.z)) return []
            return [
              {
                points: [previous, point],
                strokeColor: "#94a3b8",
                strokeWidth: route.traceThickness,
              },
            ]
          }),
    ),
    circles: [],
  }
  if (path) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!,
        b = path[i]!
      if (a.z === b.z)
        graphics.lines!.push({
          points: [a, b],
          strokeColor: "#1d4ed8",
          strokeWidth: target.traceThickness,
        })
      else
        graphics.circles!.push(
          {
            center: a,
            radius: target.viaDiameter / 2 + 0.15,
            fill: "white",
            stroke: "none",
          },
          {
            center: a,
            radius: target.viaDiameter / 2,
            fill: "#60a5fa",
            stroke: "#1d4ed8",
          },
          {
            center: a,
            radius: input.viaHoleDiameter! / 2,
            fill: "white",
            stroke: "none",
          },
        )
    }
  } else {
    for (const sign of [-1, 1])
      graphics.lines!.push({
        points: [
          { x: input.start.x - 0.2, y: input.start.y - sign * 0.2 },
          { x: input.start.x + 0.2, y: input.start.y + sign * 0.2 },
        ],
        strokeColor: "#dc2626",
        strokeWidth: 0.06,
      })
  }
  const svg = getSvgFromGraphicsObject(graphics, {
    backgroundColor: "white",
    svgWidth: 800,
    svgHeight: 800,
    includeTextLabels: false,
  })
  const frame = svg.match(/<rect\b[^>]*data-label="viewport"[^>]*\/>/)
  if (!frame) throw new Error("Missing RVboy viewport")
  const coordinates = ["x", "y", "width", "height"].map((key) => {
    const match = frame[0].match(new RegExp(`\\s${key}="([^"]+)"`))
    if (!match) throw new Error(`Missing viewport ${key}`)
    return Number(match[1])
  })
  const cropped = svg.replace(
    /<svg\b[^>]*>/,
    `<svg x="0" y="80" width="800" height="800" viewBox="${coordinates.join(" ")}" overflow="hidden" xmlns="http://www.w3.org/2000/svg">`,
  )
  return `<svg width="800" height="880" viewBox="0 0 800 880" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="20" y="28" font-family="sans-serif" font-size="20">RVboy through-via search — full exact repair input</text><text x="20" y="55" font-family="sans-serif" font-size="16">${path ? "Via connects through plane antipad" : "Plane incorrectly blocks the via"}; search nodes: ${stats.nodesPopped}</text>${cropped}</svg>`
}
