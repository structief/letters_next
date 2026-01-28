import { execSync } from 'child_process'
import Link from 'next/link'

interface Commit {
  hash: string
  date: string
  message: string
  author: string
}

async function getCommits(): Promise<Commit[]> {
  try {
    const gitLog = execSync(
      'git log --pretty=format:"%H%x09%ai%x09%s%x09%an" --date=iso -50',
      { encoding: 'utf-8', cwd: process.cwd() }
    )

    return gitLog
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('\t')
        if (parts.length < 4) return null
        const [hash, date, message, author] = parts
        return {
          hash: hash.substring(0, 7),
          date: new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
          message,
          author,
        }
      })
      .filter((commit): commit is Commit => commit !== null)
  } catch (error) {
    console.error('Error fetching git commits:', error)
    return []
  }
}

export default async function ReleasesPage() {
  const commits = await getCommits()

  return (
    <div className="landing-container" style={{ height: '100vh', height: '100dvh', overflowY: 'auto' }}>
      <div className="landing-content" style={{ maxWidth: '600px', alignItems: 'flex-start', justifyContent: 'flex-start', flex: 'none', margin: 0 }}>
        <div style={{ width: '100%', paddingBottom: '48px' }}>
          <Link 
            href="/" 
            className="landing-footer-link"
            style={{ marginBottom: '32px', display: 'inline-block' }}
          >
            ← Back to Home
          </Link>
          <h1 className="landing-title" style={{ fontSize: '32px', marginBottom: '8px' }}>
            Releases
          </h1>
          <p className="landing-subtitle" style={{ marginBottom: '48px' }}>
            Recent changes and updates
          </p>
          {commits.length === 0 ? (
            <p style={{ opacity: 0.6, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
              No commits found
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {commits.map((commit, index) => (
                <div
                  key={commit.hash}
                  style={{
                    paddingBottom: '24px',
                    borderBottom: index < commits.length - 1 ? '1px solid var(--glass-border)' : 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '8px',
                      gap: '16px',
                    }}
                  >
                    <code
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        color: 'var(--filament-accent)',
                        fontWeight: 500,
                      }}
                    >
                      {commit.hash}
                    </code>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        opacity: 0.5,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {commit.date}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: '14px',
                      lineHeight: '1.6',
                      marginBottom: '8px',
                      fontWeight: 500,
                    }}
                  >
                    {commit.message}
                  </p>
                  <p
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      opacity: 0.4,
                    }}
                  >
                    {commit.author}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
