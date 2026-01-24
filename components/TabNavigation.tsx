'use client'

interface TabNavigationProps {
  activeTab: string
  setActiveTab: (tab: string) => void
}

export default function TabNavigation({ activeTab, setActiveTab }: TabNavigationProps) {
  return (
    <nav className="tab-navigation">
      <div
        className={`tab-item ${activeTab === 'friends' ? 'active' : ''}`}
        data-tab="friends"
        onClick={() => setActiveTab('friends')}
      >
        FRIENDS
      </div>
      <div
        className={`tab-item ${activeTab === 'orbit' ? 'active' : ''}`}
        data-tab="orbit"
        onClick={() => setActiveTab('orbit')}
      >
        ORBIT
      </div>
    </nav>
  )
}
