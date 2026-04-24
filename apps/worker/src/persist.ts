import type { Pool } from 'pg'
import type { BriefingSections } from './llm/synthesize.js'

export interface PersistSource {
  url: string
  kind: string
  text: string
}

export interface PersistBriefingOpts {
  pool: Pool
  briefingId: string
  sections: BriefingSections
  sources: PersistSource[]
}

export async function persistBriefing(opts: PersistBriefingOpts): Promise<void> {
  const client = await opts.pool.connect()
  try {
    await client.query('BEGIN')

    const update = await client.query(
      `UPDATE briefings
         SET status = 'ready',
             sections = $1::jsonb,
             sources_count = $2,
             research_finished_at = now(),
             updated_at = now()
       WHERE id = $3`,
      [JSON.stringify(opts.sections), opts.sources.length, opts.briefingId],
    )
    if (update.rowCount === 0) {
      throw new Error(`persistBriefing: no briefing row for id ${opts.briefingId}`)
    }

    for (const src of opts.sources) {
      await client.query(
        `INSERT INTO sources (id, briefing_id, kind, url, excerpt, status, fetched_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ok', now())`,
        [opts.briefingId, src.kind, src.url, src.text],
      )
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}
