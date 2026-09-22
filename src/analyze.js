const SKIPPED_TEST = [
  { kind: "skipped test", pattern: /\b(?:it|test|describe)\.skip\b/ },
  { kind: "skipped test", pattern: /\bx(?:it|test|describe)\s*\(/ },
  { kind: "skipped test", pattern: /\bpytest\.mark\.skip(?:if)?\b/ },
  { kind: "skipped test", pattern: /@unittest\.skip/ },
  { kind: "skipped test", pattern: /\bt\.Skip(?:f|Now)?\s*\(/ },
]

const SILENCED_LINT = [
  { kind: "silenced lint", pattern: /eslint-disable/ },
  { kind: "silenced lint", pattern: /@ts-ignore\b/ },
  { kind: "silenced lint", pattern: /@ts-expect-error\b/ },
  { kind: "silenced lint", pattern: /@ts-nocheck\b/ },
  { kind: "silenced lint", pattern: /\bnoqa\b/ },
  { kind: "silenced lint", pattern: /\bnolint\b/ },
  { kind: "silenced lint", pattern: /pylint:\s*disable/ },
  { kind: "silenced lint", pattern: /biome-ignore/ },
  { kind: "silenced lint", pattern: /rubocop:disable/ },
]

const STUB = [
  { kind: "unimplemented stub", pattern: /\b(?:TODO|FIXME)\b/ },
  { kind: "unimplemented stub", pattern: /not implemented/i },
  { kind: "unimplemented stub", pattern: /\bunimplemented!\s*\(/ },
  { kind: "unimplemented stub", pattern: /\btodo!\s*\(/ },
  { kind: "unimplemented stub", pattern: /raise\s+NotImplementedError\b/ },
  { kind: "unimplemented stub", pattern: /throw\s+new\s+Error\(\s*['"]not implemented/i },
]

const ASSERTION = /\b(?:assert|expect)\s*\(|\bassert(?:Equal|Equals|True|False|That|Is|In|Raises|AlmostEqual)\b|\bassert_[a-z0-9_]+\s*\(/

const IGNORED_PATH = /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock)$|\.(?:png|jpg|jpeg|gif|webp|ico|pdf|min\.js)$/

function matchRule(text, rules) {
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      return rule.kind
    }
  }
  return null
}

function classifyAdded(text) {
  return matchRule(text, SKIPPED_TEST) || matchRule(text, SILENCED_LINT) || matchRule(text, STUB)
}

function isAssertion(text) {
  return ASSERTION.test(text)
}

function parseHunkHeader(line) {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
  if (!match) {
    return null
  }
  return { oldLine: Number(match[1]), newLine: Number(match[2]) }
}

export function analyzePatch(filename, patch) {
  if (!filename || typeof patch !== "string" || patch.length === 0) {
    return []
  }
  if (IGNORED_PATH.test(filename)) {
    return []
  }

  const findings = []
  let oldLine = 0
  let newLine = 0
  let inHunk = false

  for (const line of patch.split("\n")) {
    const header = parseHunkHeader(line)
    if (header) {
      oldLine = header.oldLine
      newLine = header.newLine
      inHunk = true
      continue
    }
    if (!inHunk || line.startsWith("\\")) {
      continue
    }

    if (line.startsWith("+")) {
      const text = line.slice(1)
      const kind = classifyAdded(text)
      if (kind) {
        findings.push({
          path: filename,
          line: newLine,
          side: "RIGHT",
          kind,
          text: text.trim().slice(0, 180),
        })
      }
      newLine += 1
      continue
    }

    if (line.startsWith("-")) {
      const text = line.slice(1)
      if (isAssertion(text)) {
        findings.push({
          path: filename,
          line: oldLine,
          side: "LEFT",
          kind: "stripped assertion",
          text: text.trim().slice(0, 180),
        })
      }
      oldLine += 1
      continue
    }

    oldLine += 1
    newLine += 1
  }

  return findings
}

export function analyzeFiles(files) {
  if (!Array.isArray(files)) {
    throw new TypeError("files must be an array")
  }
  const findings = []
  for (const file of files) {
    if (!file || typeof file.filename !== "string") {
      continue
    }
    findings.push(...analyzePatch(file.filename, file.patch || ""))
  }
  return findings
}

export function summarize(findings) {
  if (findings.length === 0) {
    return {
      title: "Quality bar held",
      summary: "No skipped tests, stripped assertions, silenced lints, or unimplemented stubs were added.",
      conclusion: "success",
    }
  }

  const lines = findings.map((finding) => {
    const where = finding.side === "LEFT" ? `${finding.path} (removed)` : `${finding.path}:${finding.line}`
    return `- ${finding.kind} at ${where}: \`${finding.text}\``
  })
  return {
    title: "Quality bar weakened",
    summary: lines.join("\n"),
    conclusion: "failure",
  }
}
