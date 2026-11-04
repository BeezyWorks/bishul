import type { Env } from './env'
import { TokenError, challenge, protectedResourceMetadata, verifyAccessToken } from './oauth'

// A stateless, hand-written MCP endpoint (Streamable HTTP, JSON replies only): every POST is self-contained, there are
// no sessions and no server-sent streams. The tools are intent-level (BRIEF.md §11) and are added by the API/MCP
// work; for now the list is empty.

const SERVER = { name: 'bishul', title: 'Bishul', version: '0.1.0' }
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const MAX_BODY = 256 * 1024
const INSTRUCTIONS = 'Bishul plans kosher meals for a household. No tools are available yet.'

interface RpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method?: unknown
  params?: unknown
}

const rpcError = (id: unknown, code: number, message: string) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
})
const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result })
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function handleMessage(msg: unknown) {
  if (!isObject(msg) || (msg as unknown as RpcRequest).jsonrpc !== '2.0')
    return rpcError(null, -32600, 'Not a JSON-RPC 2.0 message')
  const m = msg as unknown as RpcRequest
  // A response or notification from the client needs no answer.
  if (typeof m.method !== 'string' || m.id === undefined) return undefined
  switch (m.method) {
    case 'initialize': {
      const asked = isObject(m.params) ? m.params.protocolVersion : undefined
      return rpcResult(m.id, {
        protocolVersion: PROTOCOLS.includes(asked as string) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return rpcResult(m.id, {})
    case 'tools/list':
      return rpcResult(m.id, { tools: [] })
    default:
      return rpcError(m.id, -32601, `Method not found: ${m.method.slice(0, 60)}`)
  }
}

/**
 * `/mcp`. Every request needs a valid access token (so a client without one is sent to sign in).
 * GET and DELETE are 405 (no server-sent streams, no sessions).
 */
export async function handleMcp(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/.well-known/')) return protectedResourceMetadata(env)
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { allow: 'POST' } })

  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')
  try {
    if (!match) throw new TokenError('invalid_token', '')
    await verifyAccessToken(env, match[1])
  } catch (e) {
    if (!(e instanceof TokenError)) throw e
    if (e.kind === 'insufficient_scope') return challenge(env, 'insufficient_scope', e.message)
    return challenge(env, match ? 'invalid_token' : 'missing', match ? e.message : undefined)
  }

  const text = await request.text()
  if (text.length > MAX_BODY)
    return Response.json(rpcError(null, -32600, 'The request is too large'), { status: 413 })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 })
  }
  const batch = Array.isArray(body)
  const messages: unknown[] = Array.isArray(body) ? body : [body]
  if (!messages.length || messages.length > 20)
    return Response.json(rpcError(null, -32600, 'Invalid batch'), { status: 400 })
  const replies = messages.map(handleMessage).filter((r) => r !== undefined)
  if (!replies.length) return new Response(null, { status: 202 })
  return Response.json(batch ? replies : replies[0])
}
