import { createContext, useContext, useState, useCallback } from 'react'
import { loginUser, createApiClient } from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('ehr_hospital_user')) } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem('ehr_hospital_token') || null)

  const api = useCallback(
    () => createApiClient(token, user?.role),
    [token, user?.role]
  )

  const login = async (username, password) => {
    const data = await loginUser(username, password)
    const userData = data.data
    setToken(userData.token)
    setUser(userData.user)
    localStorage.setItem('ehr_hospital_token', userData.token)
    localStorage.setItem('ehr_hospital_user', JSON.stringify(userData.user))
    return userData
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('ehr_hospital_token')
    localStorage.removeItem('ehr_hospital_user')
  }

  return (
    <AuthContext.Provider value={{ user, token, api, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
