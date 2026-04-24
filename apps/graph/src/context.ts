export interface GraphContext {
  user?: unknown
  redis?: unknown
  insforge?: unknown
}

export async function buildContext(_req: Request): Promise<GraphContext> {
  return {}
}
