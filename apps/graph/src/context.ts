export interface GraphContext {
  user?: unknown
  redis?: unknown
  insforge?: unknown
}

export function buildContext(_req: Request): GraphContext {
  return {}
}
