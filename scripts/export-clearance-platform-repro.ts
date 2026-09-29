import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"

const outputDirectory = process.argv[2]
if (!outputDirectory) throw new Error("Expected output directory")
const inputText = readFileSync(
  new URL(
    "../tests/fixtures/gameboy-clearance-projection.json",
    import.meta.url,
  ),
  "utf8",
)
const input: Parameters<typeof relaxTraceClearance>[0] = JSON.parse(inputText)
const output = JSON.stringify(relaxTraceClearance(input))
mkdirSync(outputDirectory, { recursive: true })
writeFileSync(`${outputDirectory}/routes.json`, output)
writeFileSync(
  `${outputDirectory}/metadata.json`,
  JSON.stringify({
    bun: Bun.version,
    inputHash: createHash("sha256").update(inputText).digest("hex"),
    outputHash: createHash("sha256").update(output).digest("hex"),
  }),
)
