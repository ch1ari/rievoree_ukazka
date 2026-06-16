import { useContext } from "react"
import { AuthContext } from "./AuthProvider"

/** Read the single auth state (session, user, role, loading). */
export function useAuth() {
  return useContext(AuthContext)
}
