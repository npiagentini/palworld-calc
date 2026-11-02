import { useState } from 'react'
import { useOwners } from './settings'
import { BreedCalc } from './views/BreedCalc'
import { MyPals } from './views/MyPals'
import { Planner } from './views/Planner'
import { Settings } from './views/Settings'

const TABS = ['My Pals', 'Breed', 'Planner', 'Settings'] as const
type Tab = (typeof TABS)[number]

export default function App() {
  const [tab, setTab] = useState<Tab>('My Pals')
  const [owners, setOwners] = useOwners()

  return (
    <div className="app">
      <main>
        {tab === 'My Pals' && <MyPals owners={owners} />}
        {tab === 'Breed' && <BreedCalc />}
        {tab === 'Planner' && <Planner />}
        {tab === 'Settings' && <Settings owners={owners} setOwners={setOwners} />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
    </div>
  )
}
