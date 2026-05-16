import { useState, useEffect, useCallback } from 'react'
import { useTracker } from './hooks/useTracker'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import OnboardingPage from './pages/OnboardingPage'
import DashboardPage from './pages/DashboardPage'
import PregnancyDashboard from './pages/PregnancyDashboard'
import JournalPage from './pages/JournalPage'
import BenefitsPage from './pages/BenefitsPage'
import WorkshopsPage from './pages/WorkshopsPage'
import ProAreaPage from './pages/ProAreaPage'
import AdminPage from './pages/AdminPage'
import ServicesMarketplacePage from './pages/ServicesMarketplacePage'
import CommunityPage from './pages/CommunityPage'
import PublicFormPage from './pages/PublicFormPage'
import PublicBabyPage from './pages/PublicBabyPage'
import GuestJoinPage from './pages/GuestJoinPage'
import PublicPartnerPage from './pages/PublicPartnerPage'
import PublicRegisterPage from './pages/PublicRegisterPage'
import ThankYouPage from './pages/ThankYouPage'
import UserSettingsPage from './pages/UserSettingsPage'
import SleepPage from './pages/log/SleepPage'
import TummyTimePage from './pages/log/TummyTimePage'
import BreastfeedingPage from './pages/log/BreastfeedingPage'
import BottomNav from './components/BottomNav'
import AdminSidebar from './components/AdminSidebar'
import MimoLogo from './components/MimoLogo'
import FormTriggerModal from './components/FormTriggerModal'
import ActiveTimerBanner from './components/ActiveTimerBanner'
import InstallPrompt from './components/InstallPrompt'

export type Page = 'dashboard' | 'journal' | 'benefits' | 'workshops' | 'pro' | 'admin' | 'community' | 'marketplace' | 'log-sleep' | 'log-tummy' | 'log-feeding-breast'
export type AdminSection = 'insights' | 'users' | 'workshops' | 'forms' | 'leads' | 'tips' | 'videos' | 'perks' | 'pregnancy' | 'partners' | 'registrations' | 'settings'

// Detect public URLs
const publicFormId = new URLSearchParams(window.location.search).get('form')
const publicBabyToken = new URLSearchParams(window.location.search).get('baby')
const joinToken = new URLSearchParams(window.location.search).get('join')
const isPartnerPage = new URLSearchParams(window.location.search).has('partner')
const isRegisterPage = new URLSearchParams(window.location.search).has('register')
const isThanksPage = new URLSearchParams(window.location.search).has('thanks')
const isSettingsPage = new URLSearchParams(window.location.search).has('settings')

const FORMS_LS_KEY = 'forms_last_seen'
const REGS_LS_KEY = 'registrations_last_seen'

function AppInner() {
  const { user, profile, loading, isGuest } = useAuth()
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [adminSection, setAdminSection] = useState<AdminSection>('insights')
  const [viewAsUser, setViewAsUser] = useState(false)
  const [unreadForms, setUnreadForms] = useState(0)
  const [unreadRegistrations, setUnreadRegistrations] = useState(0)
  // Bumps when a timer starts/stops on a log page so the global banner
  // refetches without a full page reload. ActivityTimers / SleepPage also
  // mutate active_timers, so a bump on every page change captures those.
  const [timerVersion, setTimerVersion] = useState(0)
  const { track } = useTracker()

  useEffect(() => {
    track('page_view', { page: currentPage })
    // Banner picks up any timer changes that happened on the previous page.
    setTimerVersion(v => v + 1)
  }, [currentPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-land admins on the admin page (unless viewing as user)
  useEffect(() => {
    if (profile?.is_admin && !viewAsUser) {
      setCurrentPage('admin')
    }
  }, [profile?.is_admin, viewAsUser])

  // Guests land on journal and clean up URL
  useEffect(() => {
    if (isGuest) {
      setCurrentPage('journal')
      if (joinToken) {
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [isGuest]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch unread form submissions count (badge)
  useEffect(() => {
    if (!profile?.is_admin || viewAsUser) return
    const lastSeen = localStorage.getItem(FORMS_LS_KEY) ?? '1970-01-01T00:00:00Z'
    supabase
      .from('form_submissions')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', lastSeen)
      .then(({ count }) => setUnreadForms(count ?? 0))
  }, [profile?.is_admin, viewAsUser])

  const clearFormsBadge = useCallback(() => {
    localStorage.setItem(FORMS_LS_KEY, new Date().toISOString())
    setUnreadForms(0)
  }, [])

  // Fetch unread registration leads count (badge) — counts pending leads since last view
  useEffect(() => {
    if (!profile?.is_admin || viewAsUser) return
    const lastSeen = localStorage.getItem(REGS_LS_KEY) ?? '1970-01-01T00:00:00Z'
    supabase
      .from('registration_leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gt('created_at', lastSeen)
      .then(({ count }) => setUnreadRegistrations(count ?? 0))
  }, [profile?.is_admin, viewAsUser])

  const clearRegistrationsBadge = useCallback(() => {
    localStorage.setItem(REGS_LS_KEY, new Date().toISOString())
    setUnreadRegistrations(0)
  }, [])

  function navigate(page: Page) {
    setCurrentPage(page)
  }

  function navigateAdmin(section: AdminSection) {
    setAdminSection(section)
    setCurrentPage('admin')
    if (section === 'forms') clearFormsBadge()
    if (section === 'registrations') clearRegistrationsBadge()
  }

  if (publicFormId) return <PublicFormPage formId={publicFormId} />
  if (publicBabyToken) return <PublicBabyPage token={publicBabyToken} />
  if (joinToken && !user) return <GuestJoinPage token={joinToken} />
  if (isPartnerPage) return <PublicPartnerPage />
  if (isRegisterPage) return <PublicRegisterPage />
  if (isThanksPage) return <ThankYouPage />

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FFFFFF' }}>
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
  if (!profile && !isGuest) return <OnboardingPage />

  // Authenticated user settings — accessible from any role except guest
  if (isSettingsPage && !isGuest) return <UserSettingsPage />

  // Guests see ONLY the journal — no nav, no other pages
  if (isGuest) {
    return (
      <div className="min-h-screen" style={{ background: '#FFFFFF' }}>
        <JournalPage />
      </div>
    )
  }

  const isAdminMode = (profile?.is_admin ?? false) && !viewAsUser
  const isPregnant = profile?.user_mode === 'pregnant'

  const renderPage = () => {
    // Pregnant users get their own dashboard
    if (currentPage === 'dashboard' && isPregnant) {
      return <PregnancyDashboard onNavigate={setCurrentPage} />
    }
    switch (currentPage) {
      case 'dashboard':  return <DashboardPage onNavigate={setCurrentPage} />
      case 'journal':    return isPregnant ? <PregnancyDashboard onNavigate={setCurrentPage} /> : <JournalPage onNavigate={setCurrentPage} />
      case 'benefits':   return <BenefitsPage />
      case 'workshops':  return <WorkshopsPage />
      case 'pro':        return <ProAreaPage />
      case 'admin':      return <AdminPage defaultSection={adminSection} unreadForms={unreadForms} onFormsViewed={clearFormsBadge} unreadRegistrations={unreadRegistrations} onRegistrationsViewed={clearRegistrationsBadge} />
      case 'marketplace': return <ServicesMarketplacePage />
      case 'community':  return <CommunityPage />
      case 'log-sleep':  return <SleepPage onBack={() => setCurrentPage('dashboard')} onSaved={() => setTimerVersion(v => v + 1)} />
      case 'log-tummy':  return <TummyTimePage onBack={() => setCurrentPage('dashboard')} onSaved={() => setTimerVersion(v => v + 1)} />
      case 'log-feeding-breast': return <BreastfeedingPage onBack={() => setCurrentPage('dashboard')} onSaved={() => setTimerVersion(v => v + 1)} />
      default:           return isPregnant
        ? <PregnancyDashboard onNavigate={setCurrentPage} />
        : <DashboardPage onNavigate={setCurrentPage} />
    }
  }

  const toggleUserView = () => {
    const next = !viewAsUser
    setViewAsUser(next)
    setCurrentPage(next ? 'dashboard' : 'admin')
  }

  if (isAdminMode) {
    return (
      <div className="min-h-screen lg:flex lg:flex-row-reverse" dir="rtl">
        {/* Sidebar — desktop only */}
        <div className="hidden lg:block">
          <AdminSidebar
            section={adminSection}
            onSection={navigateAdmin}
            viewAsUser={viewAsUser}
            onToggleUserView={toggleUserView}
            unreadForms={unreadForms}
            unreadRegistrations={unreadRegistrations}
          />
        </div>

        {/* Main content — single render */}
        <main className="flex-1 min-h-screen pb-20 lg:pb-0 lg:overflow-y-auto admin-main-bg">
          {renderPage()}
        </main>

        {/* Bottom nav — mobile only */}
        <div className="lg:hidden">
          <BottomNav
            currentPage={currentPage} onNavigate={navigate}
            isAdminMode={true} isGuest={false}
            adminSection={adminSection} onAdminSection={navigateAdmin}
            viewAsUser={viewAsUser} onToggleUserView={toggleUserView}
          />
        </div>

        <FormTriggerModal />
      </div>
    )
  }

  // Dedicated action pages get a full screen — no bottom nav, no install prompt
  // (they have their own back button + sticky CTA).
  const isLogPage = currentPage.startsWith('log-')

  return (
    <div className={`min-h-screen ${isLogPage ? '' : 'pb-20'}`} style={{ background: '#FFFFFF' }}>
      <ActiveTimerBanner onNavigate={setCurrentPage} refetchKey={timerVersion} />
      {renderPage()}
      {!isLogPage && (
        <>
          <BottomNav
            currentPage={currentPage} onNavigate={navigate}
            isAdminMode={false} isGuest={isGuest}
            adminSection={adminSection} onAdminSection={navigateAdmin}
            viewAsUser={viewAsUser} onToggleUserView={toggleUserView}
          />
          <InstallPrompt />
        </>
      )}
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
