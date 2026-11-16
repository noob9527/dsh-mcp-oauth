import assert from 'node:assert/strict'
/** Obtain the issued response without following or fetching the callback URL. */
export async function authorizationResponse(url: string): Promise<string> {
  const html = await (await fetch(url)).text()
  const link = html.match(/href="([^"]+)"/)?.[1]; assert(link)
  const approved = await fetch(new URL(link, url), { redirect: 'manual' })
  const location = approved.headers.get('location'); assert(location)
  return location
}

