import { readFileSync } from "node:fs"

const [linuxDirectory, macDirectory] = process.argv.slice(2)
if (!linuxDirectory || !macDirectory) {
  throw new Error("Expected Linux and Mac result directories")
}
const linux = JSON.parse(readFileSync(`${linuxDirectory}/metadata.json`, "utf8"))
const mac = JSON.parse(readFileSync(`${macDirectory}/metadata.json`, "utf8"))
if (linux.bun !== mac.bun || linux.inputHash !== mac.inputHash) {
  throw new Error("Runtime version or repro inputs do not match")
}
const linuxRoutes = readFileSync(`${linuxDirectory}/routes.json`, "utf8")
const macRoutes = readFileSync(`${macDirectory}/routes.json`, "utf8")
console.log({ linux, mac })
if (linuxRoutes !== macRoutes) {
  throw new Error("Clearance projection differs between Linux and Mac")
}
console.log("Clearance projection is byte-identical between Linux and Mac")
