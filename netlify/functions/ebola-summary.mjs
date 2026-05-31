import { getDashboardPayload } from '../../server/ebola-data.mjs'

export async function handler() {
  try {
    const payload = await getDashboardPayload()

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(payload),
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Unable to load live outbreak data right now.',
        detail: error instanceof Error ? error.message : 'Unknown error',
      }),
    }
  }
}
