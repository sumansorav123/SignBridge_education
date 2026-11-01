import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { FullPageLoader } from '@/components/ui/Misc'

export default function ProtectedRoute({ role }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader label="Checking your session…" />

  if (!user) {
    const target = role === 'teacher' ? '/login/teacher' : role === 'student' ? '/login/student' : '/'
    return <Navigate to={target} replace state={{ from: location.pathname }} />
  }

  if (role && user.role !== role) {
    return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />
  }

  return <Outlet />
}
