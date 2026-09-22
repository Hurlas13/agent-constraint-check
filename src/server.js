import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { pathToFileURL } from "node:url"
import { analyzeFiles, summarize } from "./analyze.js"
import {
  createAppJwt,
  createCheckRun,
  createInstallationToken,
  listPullFiles,
  verifyWebhookSignature,
} from "./github.js"

const CHECK_NAME = "Agent Constraint Check"
const HANDLED_ACTIONS = new Set(["opened", "synchronize", "reopened", "ready_for_review"])

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return
  }
  const text = fs.readFileSync(filePath, "utf8")
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue
    }
    const index = trimmed.indexOf("=")
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim()
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name}`)
  }
  return value
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on("data", (chunk) => {
      chunks.push(chunk)
      const size = chunks.reduce((sum, part) => sum + part.length, 0)
      if (size > 2_000_000) {
        reject(new Error("Webhook body is too large"))
        request.destroy()
      }
    })
    request.on("end", () => resolve(Buffer.concat(chunks)))
    request.on("error", reject)
  })
}

function annotationsFor(findings) {
  return findings
    .filter((finding) => finding.side === "RIGHT" && Number.isInteger(finding.line) && finding.line > 0)
    .slice(0, 50)
    .map((finding) => ({
      path: finding.path,
      start_line: finding.line,
      end_line: finding.line,
      annotation_level: "failure",
      message: `${finding.kind}: ${finding.text}`,
    }))
}

export async function handlePullRequest(payload, config) {
  const action = payload.action
  if (!HANDLED_ACTIONS.has(action)) {
    return { ignored: true, action }
  }
  const pull = payload.pull_request
  const repo = payload.repository
  const installationId = payload.installation?.id
  if (!pull?.number || !pull?.head?.sha || !repo?.owner?.login || !repo?.name || !installationId) {
    throw new Error("Pull request payload is missing owner, repo, number, sha, or installation")
  }

  const appJwt = createAppJwt(config.appId, config.privateKey)
  const token = await createInstallationToken(appJwt, installationId)
  const files = await listPullFiles(token, repo.owner.login, repo.name, pull.number)
  const findings = analyzeFiles(files)
  const report = summarize(findings)
  const annotations = annotationsFor(findings)
  const output = {
    title: report.title,
    summary: report.summary,
  }
  if (annotations.length > 0) {
    output.annotations = annotations
  }

  const check = await createCheckRun(token, repo.owner.login, repo.name, {
    name: CHECK_NAME,
    head_sha: pull.head.sha,
    status: "completed",
    conclusion: report.conclusion,
    output,
  })
  return {
    ignored: false,
    conclusion: report.conclusion,
    findings: findings.length,
    checkRunId: check?.id ?? null,
  }
}

export function createServer(config) {
  return http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        response.writeHead(200, { "Content-Type": "text/plain" })
        response.end("ok")
        return
      }
      if (request.method !== "POST" || request.url !== "/webhook") {
        response.writeHead(404, { "Content-Type": "text/plain" })
        response.end("not found")
        return
      }

      const rawBody = await readBody(request)
      const signature = request.headers["x-hub-signature-256"]
      if (typeof signature !== "string" || !verifyWebhookSignature(config.webhookSecret, rawBody, signature)) {
        response.writeHead(401, { "Content-Type": "text/plain" })
        response.end("invalid signature")
        return
      }

      const event = request.headers["x-github-event"]
      if (event === "ping") {
        response.writeHead(200, { "Content-Type": "text/plain" })
        response.end("pong")
        return
      }
      if (event !== "pull_request") {
        response.writeHead(200, { "Content-Type": "text/plain" })
        response.end("ignored")
        return
      }

      const payload = JSON.parse(rawBody.toString("utf8"))
      const result = await handlePullRequest(payload, config)
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify(result))
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error"
      console.error(message)
      if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "text/plain" })
        response.end("check failed")
      }
    }
  })
}

function loadConfig() {
  const envFile = process.env.ACC_ENV
    || path.join(os.homedir(), ".agent-constraint-check", "service.env")
  loadEnvFile(envFile)
  let privateKey = process.env.GITHUB_PRIVATE_KEY
  if (!privateKey) {
    const keyPath = requireEnv("GITHUB_PRIVATE_KEY_PATH")
    if (!fs.existsSync(keyPath)) {
      throw new Error(`Private key file not found at ${keyPath}`)
    }
    privateKey = fs.readFileSync(keyPath, "utf8")
  }
  privateKey = privateKey.replace(/\\n/g, "\n")
  return {
    appId: requireEnv("GITHUB_APP_ID"),
    privateKey,
    webhookSecret: requireEnv("GITHUB_WEBHOOK_SECRET"),
    port: Number(process.env.PORT || "8787"),
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  const config = loadConfig()
  const server = createServer(config)
  const host = process.env.HOST || "0.0.0.0"
  server.listen(config.port, host, () => {
    console.log(`listening on ${host}:${config.port}`)
  })
}
