'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { GCPHeader } from './GCPHeader'
import { GCPSidebar } from './GCPSidebar'
import { PageTransition } from './PageTransition'
import { useAuth } from '@/hooks/useAuth'
import { LogOut } from 'lucide-react'

interface GCPLayoutProps {
  children: React.ReactNode
  activeFeature?: string
  projectName?: string
}

export function GCPLayout({ children, activeFeature = 'Course Monitoring', projectName = 'Course Monitoring' }: GCPLayoutProps) {
  const { user, logout, isLoggingOut } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const [targetPage, setTargetPage] = useState('')
  const [isEntering, setIsEntering] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Track mount for portal
  useEffect(() => {
    setMounted(true)
  }, [])

  // Entrance animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsEntering(false), 100)
    return () => clearTimeout(timer)
  }, [])

  // Toggle sidebar with ESC key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsSidebarOpen(prev => !prev)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Prevent body scroll when sidebar is open or logging out
  useEffect(() => {
    if (isSidebarOpen || isLoggingOut) {
      // Store current scroll position and lock body
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.left = '0'
      document.body.style.right = '0'
      document.body.style.overflow = 'hidden'
    } else {
      // Restore scroll position
      const scrollY = document.body.style.top
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.overflow = ''
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1)
      }
    }
    return () => {
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.overflow = ''
    }
  }, [isSidebarOpen, isLoggingOut])

  // Handle navigation to external feature
  const handleNavigate = (url: string, label: string) => {
    setIsNavigating(true)
    setTargetPage(label)
    
    // Delay navigation to show transition
    setTimeout(() => {
      window.location.href = url
    }, 500)
  }

  // Navigate to home page
  const handleLogoClick = () => {
    handleNavigate('/home', 'Home Page')
  }

  // Logout overlay rendered via portal to document.body
  const logoutOverlay = mounted && isLoggingOut ? createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-red-50"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh' }}
    >
      <div className="text-center">
        <div className="relative w-32 h-32 mx-auto mb-6">
          <img
            src="/au-monitoring-logo2.png"
            alt="AU Monitoring Logo"
            className="w-full h-full object-contain rounded-full animate-pulse"
          />
        </div>
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-3 h-3 bg-red-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-3 h-3 bg-red-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-3 h-3 bg-red-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Signing you out...</h2>
        <p className="text-gray-500 text-sm">See you next time!</p>
      </div>
    </div>,
    document.body
  ) : null

  return (
    
    <div className={`min-h-screen bg-gray-50 transition-all duration-700 ease-out ${
      isEntering ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
    }`}>
      {/* Logout overlay via portal */}
      {logoutOverlay}

      {/* Page transition overlay */}
      <PageTransition isNavigating={isNavigating} targetPage={targetPage} />

      {/* Header */}
      <GCPHeader 
        onMenuClick={() => setIsSidebarOpen(true)} 
        isSidebarOpen={isSidebarOpen}
        projectName={projectName}
        onLogoClick={handleLogoClick}
        user={user}
        onLogout={logout}
      />

      {/* Sidebar */}
      <GCPSidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)}
        activeItem={activeFeature}
        onNavigate={handleNavigate}
      />

      {/* Main content - offset for fixed header */}
      <main className="pt-14">
        {children}
      </main>
    </div>
  )
}
