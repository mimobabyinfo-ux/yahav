import { useState, useEffect } from 'react'
import { useTracker } from './hooks/useTracker'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import OnboardingPage from './pages/OnboardingPage'
import DashboardPage from './pages/DashboardPage'
import JournalPage from './pages/JournalPage'
import BenefitsPage from './pages/BenefitsPage'
import WorkshopsPage from './pages/WorkshopsPage'
import ProAreaPage from './pages/ProAreaPage'
import AdminPage from './pages/AdminPage'
import ContactPage from './pages/ContactPage'
import MyServicesPage from './pages/MyServicesPage'
import BottomNav from './components/BottomNav'
import MimoLogo from './components/MimoLogo'
import FormTriggerModal from './components/FormTriggerModal'

export type Page = 'dashboard' | 'journal' | 'benefits' | 'workshops' | 'pro' | 'admin' | 'contact' | 'services'
export type AdminSection = 'insights' | 'users' | 'forms'

function AppInner() {
  const { user, profile, loading } = useAuth()
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [adminSection, setAdminSection] = useState<AdminSection>('insights')
  const [viewAsUser, setViewAsUser] = useState(false)
  const { track } = useTracker()

  useEffect(() => {
    track('page_view', { page: currentPage })
  }, [currentPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-land admins on the admin page (unless viewing as user)
  useEffect(() => {
    if (profile?.is_admin && !viewAsUser) {
      setCurrentPage('admin')
    }
  }, [profile?.is_admin, viewAsUser])

  function navigate(page: Page) {
    setCurrentPage(page)
  }

  function navigateAdmin(section: AdminSection) {
    setAdminSection(section)
    setCurrentPage('admin')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F7F3EC 0%, #F2EBE0 100%)' }}>
        <div className="text-center flex flex-col items-center gap-4">
          <div className="animate-pulse">
            <MimoLogo size={120} />
          </div>
          <p className="text-sand-400 text-sm">טוענת...</p>
        </div>
      </div>
    )
  }

  if (!user) return <LoginPage />
  if (!profile) return <OnboardingPage />

  const isAdminMode = profile.is_admin && !viewAsUser

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':  return <DashboardPage onNavigate={setCurrentPage} />
      case 'journal':    return <JournalPage />
      case 'benefits':   return <BenefitsPage />
      case 'workshops':  return <WorkshopsPage />
      case 'pro':        return <ProAreaPage />
      case 'admin':      return <AdminPage defaultSection={adminSection} />
      case 'contact':    return <ContactPage />
      case 'services':   return <MyServicesPage />
      default:           return <DashboardPage onNavigate={setCurrentPage} />
    }
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: isAdminMode ? '#1a1a2e' : '#FAF8F4' }}>
      {renderPage()}
      <BottomNav
        currentPage={currentPage}
        onNavigate={navigate}
        isAdminMode={isAdminMode}
        adminSection={adminSection}
        onAdminSection={navigateAdmin}
        viewAsUser={viewAsUser}
        onToggleUserView={() => {
          const next = !viewAsUser
          setViewAsUser(next)
          setCurrentPage(next ? 'dashboard' : 'admin')
        }}
      />
      <FormTriggerModal />
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
