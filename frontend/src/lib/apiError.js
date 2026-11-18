/**
 * Turn an Axios error into a message that is useful to show in the UI.
 *
 * FastAPI validation errors arrive as an array of objects under `detail`,
 * application errors as a string, and platform-level failures (for example a
 * crashed Vercel Function) as an HTML/plain-text body. Without this, every
 * non-string error collapses into a generic "something went wrong" message.
 *
 * @param {unknown} error
 * @param {string} fallback
 * @returns {string}
 */
export function apiErrorMessage(error, fallback) {
  const response = error?.response
  const detail = response?.data?.detail

  if (typeof detail === 'string' && detail.trim()) return detail

  if (Array.isArray(detail)) {
    const fields = detail
      .map((item) => {
        const location = Array.isArray(item?.loc)
          ? item.loc.filter((part) => part !== 'body').join('.')
          : ''
        const message = item?.msg || 'Invalid value'
        return location ? `${location}: ${message}` : message
      })
      .filter(Boolean)
    if (fields.length) return fields.join('; ')
  }

  if (typeof response?.data === 'string') {
    const text = response.data.trim()
    if (text.startsWith('<')) {
      return `${fallback} (the server returned an HTML page instead of API JSON — the /api route is probably not reaching the backend)`
    }
    if (text && text.length <= 300) return text
  }

  if (response) return `${fallback} (HTTP ${response.status})`
  if (error?.request) {
    return `${fallback} (could not reach the API — check the deployment URL and that the backend service is running)`
  }
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message
  }
  return fallback
}
