import { z } from 'zod'

import type { Env } from './env'
import { ApiError } from './http'
import { INSTRUCTIONS, MEAL_PLANNING_PROMPT } from './mcp-text'
import { TOOLS, type Tool } from './mcp-tools'
import { TokenError, challenge, protectedResourceMetadata, verifyAccessToken } from './oauth'
import { countBadSecret } from './ratelimit'
import { openDb } from './services/ctx'
import { ensureActor } from './services/households'

// A stateless, hand-written MCP endpoint (Streamable HTTP, JSON replies only): every POST is self-contained, there are
// no sessions and no server-sent streams. The tools are intent-level (BRIEF §11); each is a thin call into the same
// services the REST faces use.

const SERVER = { name: 'bishul', title: 'Bishul', version: '1.0.0' }
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const MAX_BODY = 256 * 1024

const PROMPTS = [
  {
    name: 'meal_planning',
    title: 'Meal planning in Bishul',
    description:
      'The data model and constraint semantics behind Bishul, and the when, who, dishes, review flow. Read it before planning a meal.',
  },
]

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

// ---------------------------------------------------------------------------------------------------------------
// Tools

const schemaCache = new Map<string, unknown>()
function inputSchema(tool: Tool): unknown {
  let s = schemaCache.get(tool.name)
  if (!s) {
    const js = z.toJSONSchema(tool.input, { io: 'input', unrepresentable: 'any' }) as Record<
      string,
      unknown
    >
    delete js.$schema
    s = js
    schemaCache.set(tool.name, s)
  }
  return s
}

export const listTools = () =>
  TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: inputSchema(t),
    annotations: {
      title: t.title,
      readOnlyHint: !!t.readOnly,
      destructiveHint: !t.readOnly && !!t.destructive,
      idempotentHint: !!t.readOnly,
      openWorldHint: false,
    },
  }))

/** An error the model can act on. Nothing changed. */
function errorText(e: ApiError): string {
  const msg = e.message.replace(/\.$/, '')
  if (e.code === 'not_found')
    return `${msg}. Nothing changed. Look it up first (get_calendar, get_people, search_recipes, get_menu) and use the ids they give.`
  if (e.code === 'invalid') return `${msg}. Nothing changed. Fix the arguments and try again.`
  if (e.code === 'conflict')
    return `${msg}. Nothing changed. Show the host and ask before going further.`
  return `${msg}. Nothing changed.`
}

async function callTool(env: Env, userId: string, id: unknown, params: unknown) {
  if (!isObject(params) || typeof params.name !== 'string')
    return rpcError(id, -32602, 'tools/call needs a tool name')
  const tool = TOOLS.find((t) => t.name === params.name)
  if (!tool) return rpcError(id, -32602, `Unknown tool: ${params.name.slice(0, 60)}`)
  const args = params.arguments === undefined ? {} : params.arguments
  if (!isObject(args)) return rpcError(id, -32602, 'arguments must be an object')
  const parsed = tool.input.safeParse(args)
  if (!parsed.success) {
    const msg = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`)
      .join('; ')
    return rpcResult(id, {
      content: [{ type: 'text', text: `Invalid arguments: ${msg}. Nothing changed.` }],
      isError: true,
    })
  }
  try {
    const db = openDb(env.DB)
    const actor = await ensureActor(db, { id: userId }, 'mcp')
    const out = await tool.run({ db, actor, publicUrl: env.PUBLIC_URL }, parsed.data as never)
    const data = isObject(out.data) ? out.data : { result: out.data }
    return rpcResult(id, {
      content: [{ type: 'text', text: `${out.summary}\n\n${JSON.stringify(data)}` }],
      structuredContent: data,
      isError: false,
    })
  } catch (e) {
    if (e instanceof ApiError)
      return rpcResult(id, {
        content: [{ type: 'text', text: errorText(e) }],
        structuredContent: { error: { code: e.code, message: e.message, details: e.details } },
        isError: true,
      })
    console.error('mcp tool error', tool.name, e instanceof Error ? e.message : 'unknown')
    return rpcResult(id, {
      content: [
        {
          type: 'text',
          text: 'Something went wrong on our side. Nothing was changed that you can see; try again in a moment.',
        },
      ],
      isError: true,
    })
  }
}

// ---------------------------------------------------------------------------------------------------------------

async function handleMessage(env: Env, userId: string, msg: unknown) {
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
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return rpcResult(m.id, {})
    case 'tools/list':
      return rpcResult(m.id, { tools: listTools() })
    case 'tools/call':
      return callTool(env, userId, m.id, m.params)
    case 'prompts/list':
      return rpcResult(m.id, { prompts: PROMPTS })
    case 'prompts/get': {
      const name = isObject(m.params) ? m.params.name : undefined
      const p = PROMPTS.find((x) => x.name === name)
      if (!p) return rpcError(m.id, -32602, `Unknown prompt: ${String(name).slice(0, 60)}`)
      return rpcResult(m.id, {
        description: p.description,
        messages: [{ role: 'user', content: { type: 'text', text: MEAL_PLANNING_PROMPT } }],
      })
    }
    default:
      return rpcError(m.id, -32601, `Method not found: ${m.method.slice(0, 60)}`)
  }
}

/**
 * `/mcp`. Every request needs a valid access token (so a client without one is sent to sign in). Bad tokens count
 * against the caller's IP. GET and DELETE are 405 (no server-sent streams, no sessions).
 */
export async function handleMcp(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/.well-known/')) return protectedResourceMetadata(env)
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { allow: 'POST' } })

  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')
  let userId: string
  try {
    if (!match) throw new TokenError('invalid_token', '')
    userId = (await verifyAccessToken(env, match[1])).userId
  } catch (e) {
    if (!(e instanceof TokenError)) throw e
    if (match) {
      try {
        await countBadSecret(request, env)
      } catch (limited) {
        if (limited instanceof ApiError)
          return Response.json(
            { error: 'rate_limited' },
            { status: 429, headers: { 'retry-after': '60' } },
          )
        throw limited
      }
    }
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
  const replies = []
  for (const m of messages) {
    const r = await handleMessage(env, userId, m)
    if (r) replies.push(r)
  }
  if (!replies.length) return new Response(null, { status: 202 })
  return Response.json(batch ? replies : replies[0])
}
