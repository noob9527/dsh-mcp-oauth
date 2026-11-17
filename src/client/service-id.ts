/** Generate a stable-format suggestion; collision handling belongs to form validation. */
export function serviceIdFromLabel(label: string): string {
  const slug = label.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s-]/gu, char => /\p{L}|\p{N}/u.test(char) ? `-u${char.codePointAt(0)!.toString(16)}-` : '-')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return (slug ? /^[a-z]/.test(slug) ? slug : `service-${slug}` : 'service').slice(0, 32).replace(/-+$/g, '')
}
