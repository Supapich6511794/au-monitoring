'use client'

import { useState, useRef, useEffect } from 'react'
import { User } from '@/lib/types'
import { UserAvatar } from './UserAvatar'
import { 
  LogOut, 
  Settings, 
  User as UserIcon,
  BookOpen,
  Calendar,
  Bell,
  ChevronRight,
  ExternalLink
} from 'lucide-react'

interface ProfileDropdownProps {
  user: User | null
  onLogout: () => void
  isOpen: boolean
  onClose: () => void
  onNotificationClick?: () => void
}

export function ProfileDropdown({ user, onLogout, isOpen, onClose, onNotificationClick }: ProfileDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  const getInitials = (name: string | null, username: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }
    return username.slice(0, 2).toUpperCase()
  }

  const menuItems = [
    {
      icon: <BookOpen className="w-5 h-5" />,
      label: 'My Courses',
      description: 'View registered courses',
      href: '/',
    },
    {
      icon: <Calendar className="w-5 h-5" />,
      label: 'My Schedule',
      description: 'View your timetable',
      href: '/',
    },
    {
      icon: <Bell className="w-5 h-5" />,
      label: 'Notifications',
      description: 'Manage alerts',
      href: '#',
      onClick: onNotificationClick,
    },
  ]

  return (
    <div
      ref={dropdownRef}
      className={`
        absolute top-full right-0 mt-2 w-80
        bg-white rounded-xl shadow-xl border border-gray-200
        transform transition-all duration-200 ease-out origin-top-right
        ${isOpen 
          ? 'opacity-100 scale-100 translate-y-0' 
          : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
        }
      `}
      style={{ zIndex: 100 }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="font-semibold text-gray-800">Assumption University</span>
        <button
          onClick={onLogout}
          className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* User Info */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-start gap-3">
          {/* Avatar with provider badge */}
          <UserAvatar user={user} size="lg" showProviderBadge={true} />
          
          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 truncate">
              {user?.name || user?.username || 'User'}
            </h3>
            <p className="text-sm text-gray-500 truncate">
              {user?.email || 'No email'}
            </p>
            <a href="/account" className="mt-1 text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1 transition-colors">
              View account
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="py-2">
        {menuItems.map((item, index) => {
          const handleClick = (e: React.MouseEvent) => {
            if (item.onClick) {
              e.preventDefault()
              item.onClick()
              onClose()
            }
          }
          
          return (
            <a
              key={index}
              href={item.href}
              onClick={handleClick}
              className="flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-red-100 flex items-center justify-center text-gray-600 group-hover:text-red-600 transition-colors">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 group-hover:text-red-700 transition-colors">
                  {item.label}
                </p>
                <p className="text-xs text-gray-500">{item.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" />
            </a>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 text-red-600 hover:bg-red-100 rounded-lg font-medium transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out of AU-Monitoring
        </button>
      </div>
    </div>
  )
}
