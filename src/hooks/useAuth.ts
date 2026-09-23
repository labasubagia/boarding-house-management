import { useContext } from 'react'
import type { AuthState } from './AuthContext'
import { AuthContext } from './AuthContext'

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
