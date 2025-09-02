import React, { useState } from 'react'
import LandingPage from './components/LandingPage'
import AdminPanel from './components/AdminPanel'
import PlateDetectionPrototype from "./PlateDetectionPrototype"

export default function App() {
  const [page, setPage] = useState('prototype') 
  // options: 'prototype' | 'landing' | 'admin'

  return (
    <div>
      {page === 'prototype' && (
        <PlateDetectionPrototype />
      )}

      {page === 'landing' && (
        <LandingPage onOpenAdmin={() => setPage('admin')} />
      )}

      {page === 'admin' && (
        <AdminPanel onBack={() => setPage('landing')} />
      )}
    </div>
  )
}
