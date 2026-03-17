'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Menu, 
  Bell, 
  Database
} from 'lucide-react'
import { cn } from './utils'
import { ProfileDropdown } from './ProfileDropdown'
import { UserAvatar } from './UserAvatar'
import { NotificationPanel } from './notifications'
import { useNotifications } from '@/hooks/useNotifications'
import { User } from '@/lib/types'

interface GCPHeaderProps {
  onMenuClick: () => void
  isSidebarOpen: boolean
  projectName?: string
  onLogoClick?: () => void
  user?: User | null
  onLogout?: () => void
}

export function GCPHeader({ 
  onMenuClick, 
  isSidebarOpen, 
  projectName = 'Course Monitoring', 
  onLogoClick,
  user = null,
  onLogout = () => {}
}: GCPHeaderProps) {
  const router = useRouter()
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const { unreadCount } = useNotifications()
  const notificationWrapperRef = useRef<HTMLDivElement>(null)

  // Click-outside handler: close notification dropdown if click is outside both icon and dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        notificationWrapperRef.current &&
        !notificationWrapperRef.current.contains(event.target as Node)
      ) {
        setIsNotificationOpen(false)
      }
    }
    if (isNotificationOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isNotificationOpen])

  const toggleNotification = useCallback(() => {
    setIsNotificationOpen(prev => !prev)
  }, [])

  const handleViewCourse = (courseCode: string, section?: string) => {
    // Close notification panel first to prevent Portal DOM errors during navigation
    setIsNotificationOpen(false)
    // Longer delay to allow React to fully unmount all portals before navigation
    setTimeout(() => {
      const searchParam = encodeURIComponent(courseCode)
      const sectionParam = section ? `&section=${encodeURIComponent(section)}` : ''
      // Use db=test to show data from test database, autoOpen=true to show details panel
      router.push(`/course-monitoring?search=${searchParam}&db=test${sectionParam}&autoOpen=true`)
    }, 150)
  }

  const getInitials = (name: string | null | undefined, username: string | undefined) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }
    if (username) {
      return username.slice(0, 2).toUpperCase()
    }
    return 'U'
  }

  return (
    
    <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-[#e0e0e0] z-50 flex items-center px-4 font-['Inter',_'Roboto',_sans-serif]">
      {/* Left section */}
      <div className="flex items-center gap-4">
        {/* Hamburger menu */}
        <button 
          onClick={onMenuClick}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5 text-gray-600" />
        </button>

        {/* Logo - clickable to go home */}
        <button 
          onClick={onLogoClick}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <span className="text-xl font-bold text-red-600 tracking-tight">AU</span>
          <span className="text-xl font-light text-gray-700"> Monitoring</span>
        </button>

        {/* Project selector - dynamic based on current feature */}
        <button className="flex items-center gap-2 px-3 py-1.5 border border-[#e0e0e0] rounded hover:bg-gray-50 transition-colors ml-2">
          <Database className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-700 font-medium">{projectName}</span>
        </button>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1 ml-auto">
        {/* Notifications - with dropdown */}
        <div className="relative" ref={notificationWrapperRef}>
          <button 
            onClick={toggleNotification}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors relative" 
            title="Notifications"
          >
            <Bell className="w-5 h-5 text-gray-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown Panel */}
          <NotificationPanel 
            isOpen={isNotificationOpen}
            onClose={() => setIsNotificationOpen(false)}
            onViewCourse={handleViewCourse}
          />
        </div>

        {/* User avatar with dropdown */}
        <div className="relative ml-2">
          <button 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="transition-all"
            style={{
              borderRadius: '50%',
              padding: 0,
              outline: 'none',
              boxShadow: isProfileOpen ? '0 0 0 2px #fca5a5' : 'none'
            }}
            onMouseEnter={(e) => {
              if (!isProfileOpen) e.currentTarget.style.boxShadow = '0 0 0 2px #fca5a5'
            }}
            onMouseLeave={(e) => {
              if (!isProfileOpen) e.currentTarget.style.boxShadow = 'none'
            }}
            aria-label="User menu"
          >
            <UserAvatar user={user} size="sm" showProviderBadge={true} />
          </button>
          
          <ProfileDropdown 
            user={user}
            onLogout={onLogout}
            isOpen={isProfileOpen}
            onClose={() => setIsProfileOpen(false)}
            onNotificationClick={() => setIsNotificationOpen(true)}
          />
        </div>
      </div>
    </header>
  )
}
