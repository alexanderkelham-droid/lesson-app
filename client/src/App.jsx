import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './components/Login'
import StudentDashboard from './components/student/StudentDashboard'
import SheetView from './components/student/SheetView'
import ManagerDashboard from './components/manager/ManagerDashboard'
import StudentDetail from './components/manager/StudentDetail'
import LessonPlanBuilder from './components/manager/LessonPlanBuilder'
import TutorDashboard from './components/tutor/TutorDashboard'
import TutorStudentDetail from './components/tutor/StudentDetail'
import LiveSessionView from './components/shared/LiveSessionView'
import MarketingHome from './components/marketing/MarketingHome'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Student routes */}
          <Route path="/student" element={
            <ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>
          } />
          <Route path="/student/sheet/:lessonPlanItemId" element={
            <ProtectedRoute role="student"><SheetView /></ProtectedRoute>
          } />
          <Route path="/student/lesson-plans/:planId/live" element={
            <ProtectedRoute role="student"><LiveSessionView /></ProtectedRoute>
          } />

          {/* Manager routes */}
          <Route path="/manager" element={
            <ProtectedRoute role="manager"><ManagerDashboard /></ProtectedRoute>
          } />
          <Route path="/manager/students/:studentId" element={
            <ProtectedRoute role="manager"><StudentDetail /></ProtectedRoute>
          } />
          <Route path="/manager/lesson-plans/:planId/builder" element={
            <ProtectedRoute role="manager"><LessonPlanBuilder /></ProtectedRoute>
          } />
          <Route path="/manager/lesson-plans/new" element={
            <ProtectedRoute role="manager"><LessonPlanBuilder /></ProtectedRoute>
          } />
          <Route path="/manager/lesson-plans/:planId/live" element={
            <ProtectedRoute role="manager"><LiveSessionView /></ProtectedRoute>
          } />

          {/* Tutor routes */}
          <Route path="/tutor" element={
            <ProtectedRoute role="tutor"><TutorDashboard /></ProtectedRoute>
          } />
          <Route path="/tutor/students/:studentId" element={
            <ProtectedRoute role="tutor"><TutorStudentDetail /></ProtectedRoute>
          } />
          <Route path="/tutor/lesson-plans/:planId/builder" element={
            <ProtectedRoute role="tutor"><LessonPlanBuilder /></ProtectedRoute>
          } />
          <Route path="/tutor/lesson-plans/new" element={
            <ProtectedRoute role="tutor"><LessonPlanBuilder /></ProtectedRoute>
          } />
          <Route path="/tutor/lesson-plans/:planId/live" element={
            <ProtectedRoute role="tutor"><LiveSessionView /></ProtectedRoute>
          } />

          {/* Public marketing site */}
          <Route path="/" element={<MarketingHome />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
