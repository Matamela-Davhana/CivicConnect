export const SESSION_KEY = 'civicconnect.session'

export function readSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY))
    return value?.token && value?.user ? value : null
  } catch {
    return null
  }
}

export function writeSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    /* storage unavailable: the session lasts until the page reloads */
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* nothing to clear */
  }
}
