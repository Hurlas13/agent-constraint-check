import assert from "node:assert/strict"
import test from "node:test"
import { analyzeFiles, analyzePatch, summarize } from "../src/analyze.js"

const HUNK = "@@ -1,3 +1,4 @@\n context\n"

test("flags a skipped test on an added line", () => {
  const findings = analyzePatch("src/app.test.js", `${HUNK}+it.skip("pays", () => {})\n`)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].kind, "skipped test")
  assert.equal(findings[0].line, 2)
  assert.equal(findings[0].side, "RIGHT")
})

test("flags a silenced lint and an unimplemented stub", () => {
  const patch = [
    "@@ -1,1 +1,3 @@",
    "+// eslint-disable-next-line no-console",
    "+function run() { throw new Error(\"not implemented\") }",
    " context",
  ].join("\n")
  const findings = analyzePatch("src/run.js", patch)
  assert.deepEqual(findings.map((finding) => finding.kind), ["silenced lint", "unimplemented stub"])
})

test("flags a removed assertion without a line on the new file", () => {
  const patch = "@@ -4,3 +4,2 @@\n kept\n-expect(total).toBe(3)\n kept\n"
  const findings = analyzePatch("src/total.test.js", patch)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].kind, "stripped assertion")
  assert.equal(findings[0].side, "LEFT")
  assert.equal(findings[0].line, 5)
})

test("leaves a clean change alone and ignores lockfiles", () => {
  const files = [
    { filename: "src/add.js", patch: "@@ -1,1 +1,2 @@\n export function add(a, b) {\n+  return a + b\n" },
    { filename: "package-lock.json", patch: "@@ -1,1 +1,2 @@\n+\tit.skip('nope', () => {})\n" },
  ]
  const findings = analyzeFiles(files)
  assert.equal(findings.length, 0)
  assert.equal(summarize(findings).conclusion, "success")
})

test("fails the summary when a finding exists", () => {
  const findings = analyzePatch("t.py", "@@ -1,0 +1,1 @@\n+@pytest.mark.skip\n+def test_pays():\n")
  const report = summarize(findings)
  assert.equal(report.conclusion, "failure")
  assert.match(report.summary, /skipped test/)
})
