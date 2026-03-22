import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import OnboardingPage from './pages/OnboardingPage'
import DashboardPage from './pages/DashboardPage'
import JournalPage from './pages/JournalPage'
import BenefitsPage from './pages/BenefitsPage'
import WorkshopsPage from './pages/WorkshopsPage'
import ProAreaPage from './pages/ProAreaPage'
import AdminPage from './pages/AdminPage'
import BottomNav from './components/BottomNav'

export type Page = 'dashboard' | 'journal' | 'benefits' | 'workshops' | 'pro' | 'admin'

function AppInner() {
  const { user, profile, loading } = useAuth()
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-beige-50 via-sand-50 to-mustard-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-mustard-100 rounded-3xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-3xl">🍼</span>
          </div>
          <p className="text-sand-600 font-medium">טוענת...</p>
        </div>
      </div>
    )
  }

  if (!user) return <LoginPage />
  if (!profile) return <OnboardingPage />

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage onNavigate={setCurrentPage} />
      case 'journal': return <JournalPage />
      case 'benefits': return <BenefitsPage />
      case 'workshops': return <WorkshopsPage />
      case 'pro': return <ProAreaPage />
      case 'admin': return <AdminPage />
      default: return <DashboardPage onNavigate={setCurrentPage} />
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-beige-50 via-sand-50 to-mustard-50 pb-20">
      {renderPage()}
      <BottomNav currentPage={currentPage} onNavigate={setCurrentPage} />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
