import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import PublicLayout from '@/components/layout/PublicLayout'
import AppLayout from '@/components/layout/AppLayout'
import ProtectedRoute from '@/components/ProtectedRoute'
import Landing from '@/pages/Landing'
import About from '@/pages/About'
import Features from '@/pages/Features'
import Login from '@/pages/auth/Login'
import Register from '@/pages/auth/Register'
import NotFound from '@/pages/NotFound'
import TeacherDashboard from '@/pages/teacher/TeacherDashboard'
import TeacherClassrooms from '@/pages/teacher/TeacherClassrooms'
import { TeacherClassroomDetail, StudentClassroomRoom } from '@/pages/LiveClassroom'
import { StudentJoinRequestWaiting, TeacherJoinRequestsPage } from '@/pages/JoinRequests'
import {
  TeacherLectures,
  TeacherRecordings,
  TeacherRecordingDetail,
  TeacherStudents,
  StudentDashboard,
  StudentClassrooms,
  StudentRecordings,
  StudentRecordingPlayer,
  SignPractice,
  Settings,
} from '@/pages/PortalPages'
import { useAuth } from '@/context/AuthContext'

function ScrollToTop() {
  const location = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])
  return null
}

function PortalHome() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/" replace />
  return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="about" element={<About />} />
          <Route path="features" element={<Features />} />
        </Route>

        <Route path="login/teacher" element={<Login role="teacher" />} />
        <Route path="login/student" element={<Login role="student" />} />
        <Route path="register/teacher" element={<Register role="teacher" />} />
        <Route path="register/student" element={<Register role="student" />} />
        <Route path="portal" element={<PortalHome />} />

        <Route element={<ProtectedRoute role="teacher" />}>
          <Route path="teacher" element={<AppLayout />}>
            <Route index element={<TeacherDashboard />} />
            <Route path="classrooms" element={<TeacherClassrooms />} />
            <Route path="classrooms/:classroomId" element={<TeacherClassroomDetail />} />
            <Route path="join-requests" element={<TeacherJoinRequestsPage />} />
            <Route path="lectures" element={<TeacherLectures />} />
            <Route path="recordings" element={<TeacherRecordings />} />
            <Route path="recordings/:recordingId" element={<TeacherRecordingDetail />} />
            <Route path="students" element={<TeacherStudents />} />
            <Route path="settings" element={<Settings role="teacher" />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute role="student" />}>
          <Route path="student" element={<AppLayout />}>
            <Route index element={<StudentDashboard />} />
            <Route path="classrooms" element={<StudentClassrooms />} />
            <Route path="classrooms/:classroomId" element={<StudentClassroomRoom />} />
            <Route path="join-requests/:requestId" element={<StudentJoinRequestWaiting />} />
            <Route path="recordings" element={<StudentRecordings />} />
            <Route path="recordings/:recordingId" element={<StudentRecordingPlayer />} />
            <Route path="practice" element={<SignPractice />} />
            <Route path="settings" element={<Settings role="student" />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
