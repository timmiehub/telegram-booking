const ROLE_KEY = 'tb_role'

export function getSavedRole() {
  try {
    const v = localStorage.getItem(ROLE_KEY)
    if (v === 'client' || v === 'master') return v
  } catch {
    // ignore
  }
  return null
}

export function setSavedRole(role) {
  try {
    if (role === 'client' || role === 'master') {
      localStorage.setItem(ROLE_KEY, role)
    } else {
      localStorage.removeItem(ROLE_KEY)
    }
  } catch {
    // ignore
  }
}
