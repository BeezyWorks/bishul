import { z } from 'zod'

import { operations, type Operation } from './ops'

type Json = Record<string, any>

function schemaOf(input: z.ZodType): Json {
  const js = z.toJSONSchema(input, {
    io: 'input',
    unrepresentable: 'any',
    target: 'draft-2020-12',
  }) as Json
  delete js.$schema
  return js
}

const pathParams = (path: string) => [...path.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1])

function operationObject(op: Operation): Json {
  const params = pathParams(op.path)
  const schema = schemaOf(op.input)
  const props: Json = { ...(schema.properties ?? {}) }
  const required: string[] = (schema.required ?? []).filter((r: string) => !params.includes(r))
  for (const p of params) delete props[p]

  const parameters: Json[] = params.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: schemaOf(op.input).properties?.[name] ?? { type: 'string' },
  }))
  let requestBody: Json | undefined
  if (op.method === 'get' || op.method === 'delete') {
    for (const [name, s] of Object.entries(props))
      parameters.push({ name, in: 'query', required: required.includes(name), schema: s })
  } else if (Object.keys(props).length) {
    requestBody = {
      required: required.length > 0,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: props,
            ...(required.length && { required }),
            additionalProperties: false,
          },
        },
      },
    }
  }
  const okStatus = String(op.status ?? 200)
  return {
    operationId: op.id,
    tags: [op.tag],
    summary: op.summary,
    ...(op.description && { description: op.description }),
    ...(parameters.length && { parameters }),
    ...(requestBody && { requestBody }),
    ...(!op.public && { security: [{ apiKey: [] }] }),
    'x-scope': op.public
      ? 'public'
      : op.needsWrite
        ? 'read (write when it changes data)'
        : op.scope,
    responses: {
      [okStatus]: {
        description: 'OK',
        content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
      },
      '400': { $ref: '#/components/responses/Error' },
      ...(!op.public && { '401': { $ref: '#/components/responses/Error' } }),
      ...(op.scope === 'write' && { '403': { $ref: '#/components/responses/Error' } }),
      '404': { $ref: '#/components/responses/Error' },
    },
  }
}

/** The OpenAPI 3.1 document for `/v1`, generated from the same operations the server runs. */
export function buildOpenApi(publicUrl: string): Json {
  const paths: Json = {}
  for (const op of operations) {
    if (op.webOnly) continue
    const p = op.path.replace(/:([A-Za-z]+)/g, '{$1}')
    paths[p] ??= {}
    paths[p][op.method] = operationObject(op)
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Bishul API',
      version: '1.0.0',
      description:
        'Recipes, households and meal planning for kosher families. Authenticate with a per-user API key ("Authorization: Bearer bsk_…"); keys are read or read-write. Errors are { "error": { "code", "message" } }. Dining briefs and anything about allergies carry a disclaimer: Bishul helps avoid serving the wrong thing but it is not a guarantee, and AI-filled ingredient data is flagged.',
    },
    servers: [{ url: `${publicUrl.replace(/\/$/, '')}/v1` }],
    tags: [...new Set(operations.filter((o) => !o.webOnly).map((o) => o.tag))].map((name) => ({
      name,
    })),
    paths,
    components: {
      securitySchemes: {
        apiKey: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'bsk_…',
          description: 'A Bishul API key',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} },
            },
          },
        },
      },
      responses: {
        Error: {
          description: 'An error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
  }
}
