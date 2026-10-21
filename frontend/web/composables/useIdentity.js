import { reactive } from 'vue'

const STORAGE_KEY = 'quickdraw-identity'
const DEFAULT_IDENTITY = { studentId: '', name: '' }

export function useIdentity() {
  const identity = reactive({ ...DEFAULT_IDENTITY })
  const savedIdentity = localStorage.getItem(STORAGE_KEY)

  if (savedIdentity) {
    try {
      const saved = JSON.parse(savedIdentity)
      if (saved && typeof saved === 'object') {
        identity.studentId = saved.studentId || identity.studentId
        identity.name = saved.name || identity.name
      }
    } catch {
      // Ignore malformed local data and fall back to the defaults.
    }
  }

  function saveIdentity({ studentId, name }) {
    identity.studentId = studentId
    identity.name = name
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ studentId, name }))
  }

  return { identity, saveIdentity }
}
