import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { RecentNotebook } from '../../../preload/api'
import logo from '../assets/logo.png'
import { ContextMenu } from './ContextMenu'

export function Welcome({
  onCreate,
  onOpen,
  onOpenRecent,
  onOpenTemplates,
  onGettingStarted
}: {
  onCreate: () => void
  onOpen: () => void
  onOpenRecent: (root: string) => void
  onOpenTemplates: () => void
  onGettingStarted: () => void
}): JSX.Element {
  const [recent, setRecent] = useState<RecentNotebook[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The right-click menu of a recent notebook. */
  const [menu, setMenu] = useState<{ x: number; y: number; root: string } | null>(null)
  const forget = (root: string): void => void window.pagebinder.notebook.forget(root).then(() => window.pagebinder.notebook.recent().then(setRecent))
  useEffect(() => {
    void window.pagebinder.notebook.recent().then(setRecent)
  }, [])
  // First run, or every notebook has been removed from the list: a few lines on how the app works.
  const firstRun = recent !== null && recent.length === 0
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="brand">
          <img className="brand-logo" src={logo} alt="" />
          <h1>PageBinder</h1>
        </div>
        <p className="muted">Local notebooks stored as plain folders. Nothing leaves this machine.</p>
        <div className="welcome-actions">
          <button type="button" className="primary" onClick={onCreate}>
            Create notebook
          </button>
          <button type="button" onClick={onOpen}>
            Open notebook folder
          </button>
        </div>
        {firstRun && (
          <div className="first-run">
            <h2>Getting started</h2>
            <ul>
              <li>A notebook is an ordinary folder. Keep it on this computer's own disk; your Documents folder is a good place.</li>
              <li>Pages save as you type, and earlier versions are kept in each page's history.</li>
              <li>To back up, copy the notebook folder to a NAS or an external drive. The .index folder can be left out.</li>
            </ul>
            <button type="button" className="link-button" onClick={onGettingStarted}>
              Read the Getting Started guide
            </button>
          </div>
        )}
        <h2>System</h2>
        <ul className="recent-list">
          <li>
            <button type="button" onClick={onOpenTemplates}>
              <span className="recent-name">▦ Templates</span>
              <span className="recent-path">Your page templates, in a notebook of their own. Arrange them in sections, and edit, copy, or delete them as you would pages.</span>
            </button>
          </li>
        </ul>
        {recent && recent.length > 0 && (
          <>
            <h2>Recent</h2>
            <ul className="recent-list">
              {recent.map((r) => (
                <li key={r.root}>
                  <div className="recent-row">
                    <button
                      type="button"
                      onClick={() => onOpenRecent(r.root)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setMenu({ x: e.clientX, y: e.clientY, root: r.root })
                      }}
                    >
                      <span className="recent-name">{r.name}</span>
                      <span className="recent-path">{r.root}</span>
                    </button>
                    <button
                      type="button"
                      className="recent-forget"
                      title="Remove from this list (the notebook folder is not touched)"
                      onClick={() => forget(r.root)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <p className="error small">{error}</p>}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            {
              label: navigator.userAgent.includes('Windows') ? 'Open in Explorer' : 'Open in Finder',
              onClick: () => {
                setError(null)
                window.pagebinder.notebook.openFolder(menu.root).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
              }
            },
            { separator: true },
            { label: 'Remove from this list', onClick: () => forget(menu.root) }
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
