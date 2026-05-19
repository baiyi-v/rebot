/** 与 reference app.js encodePathSegments 一致 */
export function encodePathSegments(path) {
  return (path || '')
    .toString()
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}
