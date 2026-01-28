import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'
import LandingWaveform from '@/components/LandingWaveform'
import AnnouncementBar from '@/components/AnnouncementBar'
import CookieBanner from '@/components/CookieBanner'

export default async function Home() {
  const session = await getServerSession(authOptions)
  
  if (session) {
    redirect('/app')
  }

  const currentYear = new Date().getFullYear()

  return (
    <div className="landing-container">
      <AnnouncementBar />
      <div className="landing-content">
        <h1 className="landing-title">Lttrs.</h1>
        <p className="landing-subtitle">Voice messaging, reimagined</p>
        <div className="landing-waveform-wrapper">
          <LandingWaveform />
        </div>
        <div className="landing-actions">
          <Link href="/login" className="landing-button landing-button-primary">
            Sign In
          </Link>
          <Link href="/register" className="landing-button landing-button-secondary">
            Register
          </Link>
        </div>
      </div>
      <footer className="landing-footer">
        <div className="landing-footer-content">
          <p className="landing-footer-copyright">
            © {currentYear} Structief. All rights reserved.
          </p>
          <div className="landing-footer-links">
            <Link href="/releases" className="landing-footer-link">
              Releases
            </Link>
            <span className="landing-footer-separator">•</span>
            <span className="landing-footer-link landing-footer-link-disabled">
              Privacy Policy
            </span>
            <span className="landing-footer-separator">•</span>
            <span className="landing-footer-link landing-footer-link-disabled">
              Terms & Conditions
            </span>
          </div>
        </div>
      </footer>
      <CookieBanner />
    </div>
  )
}
