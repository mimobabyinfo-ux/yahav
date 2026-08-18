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
import VendorCheckinPage from './pages/VendorCheckinPage'
import ThankYouPage from './pages/ThankYouPage'
import LegalPage from './pages/LegalPage'
import ConsentGate from './pages/ConsentGate'
import UserSettingsPage from './pages/UserSettingsPage'
import SleepPage from './pages/log/SleepPage'
import TummyTimePage from './pages/log/TummyTimePage'
import BreastfeedingPage from './pages/log/BreastfeedingPage'
import BottlePage from './pages/log/BottlePage'
import SolidPage from './pages/log/SolidPage'
import DiaperPage from './pages/log/DiaperPage'
import MedicalPage from './pages/log/MedicalPage'
import MilestonePage from './pages/log/MilestonePage'
import NotePage from './pages/log/NotePage'
import BottomNav from './components/BottomNav'
import AdminSidebar from './components/AdminSidebar'
import { useAdminOverview } from './components/admin/useAdminOverview'
import MimoLogo from './components/MimoLogo'
import FormTriggerModal from './components/FormTriggerModal'
import ActiveTimerBanner from './components/ActiveTimerBanner'
import InstallPrompt from './components/InstallPrompt'

export type Page = 'dashboard' | 'journal' | 'benefits' | 'workshops' | 'pro' | 'admin' | 'community' | 'marketplace' | 'log-sleep' | 'log-tummy' | 'log-feeding-breast' | 'log-feeding-bottle' | 'log-feeding-solid' | 'log-diaper' | 'log-medical' | 'log-milestone' | 'log-note'
export type AdminSection = 'home' | 'insights' | 'users' | 'workshops' | 'events' | 'forms' | 'leads' | 'tips' | 'videos' | 'perks' | 'pregnancy' | 'partners' | 'registrations' | 'settings'

// Detect public URLs
const publicFormId = new URLSearchParams(window.location.search).get('form')
const publicBabyToken = new URLSearchParams(window.location.search).get('baby')
const joinToken = new URLSearchParams(window.location.search).get('join')
const isPartnerPage = new URLSearchParams(window.location.search).has('partner')
const isRegisterPage = new URLSearchParams(window.location.search).has('register')
// Task B: ?offer=<token> routes to PublicRegisterPage in offer mode.
// Needs its own early-return gate at the same level as ?register so
// the admin auto-redirect (useEffect → setCurrentPage('admin')) never
// fires for a logged-in admin testing an offer link.
const isOfferPage = new URLSearchParams(window.location.search).has('offer')
// Vendor/host check-in for community events (?checkin=<token>) — public,
// no login; access enforced by the token RPCs.
const checkinToken = new URLSearchParams(window.location.search).get('checkin')
// ?course[=<workshop id>] — where the welcome email lands. A woman who
// bought the digital course may have zero interest in the app, and making
// her hunt for it on the home screen is the fastest way to lose her. This
// opens the course itself; everything else is one tap away if she wants it.
const isCoursePage = new URLSearchParams(window.location.search).has('course')
const courseWorkshopId = new URLSearchParams(window.location.search).get('course') || null
const isThanksPage = new URLSearchParams(window.location.search).has('thanks')
// ?legal=privacy|terms|accessibility — the three documents Israeli law
// expects a consumer service to publish. Public by necessity: the signup
// screen links to them before there is an account to render a shell for.
const legalDocParam = new URLSearchParams(window.location.search).get('legal')
const legalDoc = (['privacy', 'terms', 'accessibility'] as const)
  .find(d => d === legalDocParam) ?? null
const isSettingsPage = new URLSearchParams(window.location.search).has('settings')

const FORMS_LS_KEY = 'forms_last_seen'
const REGS_LS_KEY = 'registrations_last_seen'

function AppInner() {
  const { user, profile, loading, isGuest } = useAuth()
  const [currentPage, setCurrentPage] = useState<Page>(isCoursePage ? 'pro' : 'dashboard')
  // Brenda 17.8.26: "when I go into nursing/sleep/bottle FROM the journal
  // and press back, I want to come back to the journal, not to the home
  // screen." The log pages are opened from two places, so back has to
  // remember which one — we record the page that launched it.
  const [logReturnPage, setLogReturnPage] = useState<Page>('dashboard')

  const backFromLog = useCallback(() => setCurrentPage(logReturnPage), [logReturnPage])
  // Admin lands on the home screen ("what needs me today") — design
  // handoff §3. Everything else stays reachable from the sidebar.
  const [adminSection, setAdminSection] = useState<AdminSection>('home')
  const [viewAsUser, setViewAsUser] = useState(false)
  const [unreadForms, setUnreadForms] = useState(0)
  const [unreadRegistrations, setUnreadRegistrations] = useState(0)
  // Bumps when a timer starts/stops on a log page so the global banner
  // refetches without a full page reload. ActivityTimers / SleepPage also
  // mutate active_timers, so a bump on every page change captures those.
  const [timerVersion, setTimerVersion] = useState(0)
  const { track } = useTracker()

  // One shared fetch feeding the admin home screen AND the sidebar
  // badges (task count / product problems). Disabled outside admin mode.
  const adminOverview = useAdminOverview((profile?.is_admin ?? false) && !viewAsUser)

  useEffect(() => {
    track('page_view', { page: currentPage })
    // Banner picks up any timer changes that happened on the previous page.
    setTimerVersion(v => v + 1)
  }, [currentPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-land admins on the admin page (unless viewing as user).
  // ?course wins: an admin opening a customer's welcome link wants to see
  // what the customer sees.
  useEffect(() => {
    if (isCoursePage) return
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
    // Remember the screen a log page was opened from, so its back button
    // returns there instead of always dropping her on the home screen.
    setCurrentPage(prev => {
      if (page.startsWith('log-') && !prev.startsWith('log-')) setLogReturnPage(prev)
      return page
    })
  }

  function navigateAdmin(section: AdminSection) {
    setAdminSection(section)
    setCurrentPage('admin')
    if (section === 'forms') clearFormsBadge()
    if (section === 'registrations') clearRegistrationsBadge()
  }

  if (legalDoc) return <LegalPage doc={legalDoc} />
  if (publicFormId) return <PublicFormPage formId={publicFormId} />
  if (publicBabyToken) return <PublicBabyPage token={publicBabyToken} />
  // `!loading` is load-bearing: on the very first render user is always
  // null because the session has not been restored yet. Without it, a
  // mother who already has an account and taps a share link was handed to
  // GuestJoinPage, which signs in anonymously — replacing her real
  // session with a read-only guest one.
  if (joinToken && !loading && !user) return <GuestJoinPage token={joinToken} />
  if (isPartnerPage) return <PublicPartnerPage />
  if (isRegisterPage) return <PublicRegisterPage />
  if (isOfferPage) return <PublicRegisterPage />
  if (checkinToken) return <VendorCheckinPage token={checkinToken} />
  if (isThanksPage) return <ThankYouPage />

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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

  // Consent before service, for every route in. The tick on the signup
  // form only guards that form — Google OAuth signs a new person up
  // through the same call it signs an existing one in, so it never saw
  // it. Anyone whose account carries no stamp lands here and cannot pass.
  // A guest holding a share link is looking at someone else's journal,
  // not opening an account, so they are exempt.
  const hasConsented = Boolean(
    user.user_metadata?.terms_accepted_at || profile?.terms_accepted_at,
  )
  if (!isGuest && !hasConsented) return <ConsentGate />

  if (!profile && !isGuest) return <OnboardingPage />

  // Authenticated user settings — accessible from any role except guest
  if (isSettingsPage && !isGuest) return <UserSettingsPage />

  const isAdminMode = (profile?.is_admin ?? false) && !viewAsUser
  const isPregnant = profile?.user_mode === 'pregnant'


  const renderPage = () => {
    // Pregnant users get their own dashboard
    if (currentPage === 'dashboard' && isPregnant) {
      return <PregnancyDashboard onNavigate={navigate} />
    }
    switch (currentPage) {
      case 'dashboard':  return <DashboardPage onNavigate={navigate} />
      case 'journal':    return isPregnant ? <PregnancyDashboard onNavigate={navigate} /> : <JournalPage onNavigate={navigate} />
      case 'benefits':   return <BenefitsPage />
      case 'workshops':  return <WorkshopsPage onNavigate={navigate} />
      case 'pro':        return <ProAreaPage autoOpenWorkshopId={isCoursePage ? courseWorkshopId : null} />
      case 'admin':      return <AdminPage defaultSection={adminSection} unreadForms={unreadForms} onFormsViewed={clearFormsBadge} unreadRegistrations={unreadRegistrations} onRegistrationsViewed={clearRegistrationsBadge} overview={adminOverview} />
      case 'marketplace': return <ServicesMarketplacePage />
      case 'community':  return <CommunityPage />
      case 'log-sleep':  return <SleepPage onBack={backFromLog} onSaved={() => setTimerVersion(v => v + 1)} />
      case 'log-tummy':  return <TummyTimePage onBack={backFromLog} onSaved={() => setTimerVersion(v => v + 1)} />
      case 'log-feeding-breast': return <BreastfeedingPage onBack={backFromLog} onSaved={() => setTimerVersion(v => v + 1)} />
      case 'log-feeding-bottle': return <BottlePage onBack={backFromLog} onSaved={() => setTimerVersion(v => v + 1)} />
      case 'log-feeding-solid':  return <SolidPage onBack={backFromLog} onSaved={() => setTimerVersion(v => v + 1)} />
      case 'log-diaper':         return <DiaperPage onBack={backFromLog} onSaved={() => setTimerVersion(v => v + 1)} />
      case 'log-medical':        return <MedicalPage onBack={backFromLog} onSaved={() => setTimerVersion(v => v + 1)} />
      case 'log-milestone':      return <MilestonePage onBack={backFromLog} onSaved={() => setTimerVersion(v => v + 1)} />
      case 'log-note':           return <NotePage onBack={backFromLog} onSaved={() => setTimerVersion(v => v + 1)} />
      default:           return isPregnant
        ? <PregnancyDashboard onNavigate={navigate} />
        : <DashboardPage onNavigate={navigate} />
    }
  }

  const toggleUserView = () => {
    const next = !viewAsUser
    setViewAsUser(next)
    setCurrentPage(next ? 'dashboard' : 'admin')
  }

  if (isAdminMode) {
    return (
      <div className="min-h-screen lg:flex" dir="rtl">
        {/* Sidebar — desktop only */}
        <div className="hidden lg:block">
          <AdminSidebar
            section={adminSection}
            onSection={navigateAdmin}
            viewAsUser={viewAsUser}
            onToggleUserView={toggleUserView}
            unreadForms={unreadForms}
            unreadRegistrations={unreadRegistrations}
            taskCount={adminOverview.tasks.length + adminOverview.manualTasks.length}
            workshopIssues={adminOverview.tasks.filter(t => t.section === 'workshops').length}
            partnersWaiting={adminOverview.recentPartnerLeads}
            paymentClaims={adminOverview.paymentClaimCount}
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

  // Guests see ONLY the journal — no nav, no other pages.
  //
  // Brenda 17.8.26: "the shared journal looks different from the sharer's
  // journal — they should be the same one!" It IS the same component, but
  // it was rendered in a bare div while the owner's runs inside the app
  // shell, and it was handed no onNavigate, so every quick-add fell back
  // to the modal picker instead of opening the same dedicated log pages
  // she sees. Two small omissions that added up to a different-feeling
  // screen. Same shell and the same navigation now; the only differences
  // left are the ones that must exist — a guest has no bottom nav and
  // cannot share the journal onward.
  if (isGuest) {
    return (
      <div className={`min-h-screen ${isLogPage ? '' : 'pb-6'}`}>
        <ActiveTimerBanner onNavigate={navigate} refetchKey={timerVersion} />
        <div key={currentPage} className="page-enter">
          {isLogPage ? renderPage() : <JournalPage onNavigate={navigate} />}
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${isLogPage ? '' : 'pb-20'}`}>
      {/* navigate(), not setCurrentPage — the bookkeeping that remembers
          where a log page was opened from lives in navigate. Tapping the
          running-timer pill from the journal and pressing back was
          dropping her on the home screen. */}
      <ActiveTimerBanner onNavigate={navigate} refetchKey={timerVersion} />
      <div key={currentPage} className="page-enter">{renderPage()}</div>
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
