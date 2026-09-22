import crypto from "node:crypto"

const API = "https://api.github.com"
const USER_AGENT = "agent-constraint-check"

function base64Url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return buffer.toString("base64url")
}

export function createAppJwt(appId, privateKeyPem) {
  if (!appId) {
    throw new Error("GitHub App ID is missing")
  }
  if (!privateKeyPem || !privateKeyPem.includes("PRIVATE KEY")) {
    throw new Error("GitHub App private key is missing")
  }
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = base64Url(JSON.stringify({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: String(appId),
  }))
  const unsigned = `${header}.${payload}`
  const signer = crypto.createSign("RSA-SHA256")
  signer.update(unsigned)
  signer.end()
  return `${unsigned}.${signer.sign(privateKeyPem).toString("base64url")}`
}

export function verifyWebhookSignature(secret, rawBody, signatureHeader) {
  if (!secret) {
    throw new Error("Webhook secret is missing")
  }
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false
  }
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
  const received = signatureHeader.slice("sha256=".length)
  const expectedBuf = Buffer.from(expected, "utf8")
  const receivedBuf = Buffer.from(received, "utf8")
  if (expectedBuf.length !== receivedBuf.length) {
    return false
  }
  return crypto.timingSafeEqual(expectedBuf, receivedBuf)
}

async function githubFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`GitHub ${response.status} ${url}: ${text.slice(0, 400)}`)
  }
  return text ? JSON.parse(text) : null
}

export async function createInstallationToken(appJwt, installationId) {
  if (!installationId) {
    throw new Error("Installation id is missing")
  }
  const body = await githubFetch(
    `${API}/app/installations/${installationId}/access_tokens`,
    appJwt,
    { method: "POST" },
  )
  if (!body?.token) {
    throw new Error("GitHub did not return an installation token")
  }
  return body.token
}

export async function listPullFiles(token, owner, repo, pullNumber) {
  const files = []
  let page = 1
  while (page < 10) {
    const batch = await githubFetch(
      `${API}/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100&page=${page}`,
      token,
    )
    if (!Array.isArray(batch) || batch.length === 0) {
      break
    }
    files.push(...batch)
    if (batch.length < 100) {
      break
    }
    page += 1
  }
  return files
}

export async function createCheckRun(token, owner, repo, check) {
  if (!check?.head_sha) {
    throw new Error("Check run is missing head_sha")
  }
  return githubFetch(`${API}/repos/${owner}/${repo}/check-runs`, token, {
    method: "POST",
    body: JSON.stringify(check),
  })
}
