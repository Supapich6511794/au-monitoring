'use client'

import React, { useState, useCallback } from 'react'
import { 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  Bell,
  Clock,
  Users,
  Plus,
  Eye,
  X
} from 'lucide-react'
import { Notification, NotificationType } from '@/types/notification'
import { cn } from '@/lib/utils'

interface NotificationItemProps {
  notification: Notification
  onMarkAsRead: (id: string) => void
  onAddSection: (notification: Notification) => void
  onViewCourse: (notification: Notification) => void
  onClear: (id: string) => void
}

export function NotificationItem({ 
  notification, 
  onMarkAsRead, 
  onAddSection,
  onViewCourse,
  onClear
}: NotificationItemProps) {
  const [isRemoving, setIsRemoving] = useState(false)
  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'COURSE_FULL':
        return <AlertTriangle className="w-5 h-5 text-red-500" />
      case 'SECTION_ADDED':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'SYSTEM':
        return <Bell className="w-5 h-5 text-blue-500" />
      default:
        return <Info className="w-5 h-5 text-gray-500" />
    }
  }

  const getStatusBadge = () => {
    switch (notification.status) {
      case 'unread':
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
            New
          </span>
        )
      case 'resolved':
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
            Resolved
          </span>
        )
      default:
        return null
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const handleClick = useCallback(() => {
    if (notification.status === 'unread') {
      onMarkAsRead(notification.id)
    }
  }, [notification.status, notification.id, onMarkAsRead])

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsRemoving(true)
    // Wait for animation to complete before actually removing
    setTimeout(() => {
      onClear(notification.id)
    }, 200)
  }, [notification.id, onClear])

  return (
    <div 
      onClick={handleClick}
      className={cn(
        "p-4 hover:bg-gray-50 transition-all duration-200 cursor-pointer relative group",
        notification.status === 'unread' && "bg-red-50/50",
        isRemoving && "opacity-0 scale-95 -translate-x-2"
      )}
    >
      {/* Individual Clear Button */}
      <button
        onClick={handleClear}
        className={cn(
          "absolute top-2 right-2 p-1 rounded-full transition-all duration-150",
          "opacity-0 group-hover:opacity-100",
          "hover:bg-gray-200 text-gray-400 hover:text-gray-600",
          "md:opacity-0 md:group-hover:opacity-100",
          "max-md:opacity-100" // Always visible on mobile
        )}
        title="Clear notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
          notification.type === 'COURSE_FULL' ? "bg-red-100" :
          notification.type === 'SECTION_ADDED' ? "bg-green-100" :
          "bg-gray-100"
        )}>
          {getIcon(notification.type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold text-gray-900 text-sm truncate">
              {notification.title}
            </h4>
            {getStatusBadge()}
          </div>

          <p className="text-sm text-gray-600 mb-2">
            {notification.message}
          </p>

          {/* Course details for COURSE_FULL */}
          {notification.type === 'COURSE_FULL' && (
            <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-3">
              {notification.seatLimit && (
                <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded">
                  <Users className="w-3 h-3" />
                  {notification.seatLimit} seats
                </span>
              )}
              {notification.section && (
                <span className="px-2 py-1 bg-gray-100 rounded">
                  Sec {notification.section}
                </span>
              )}
              {notification.day && notification.startTime && (
                <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded">
                  <Clock className="w-3 h-3" />
                  {notification.day} {notification.startTime}
                </span>
              )}
            </div>
          )}

          {/* Action buttons for COURSE_FULL */}
          {notification.type === 'COURSE_FULL' && notification.status !== 'resolved' && (
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onAddSection(notification)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add New Section
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onViewCourse(notification)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                View Course
              </button>
            </div>
          )}

          {/* Timestamp */}
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            {formatTime(notification.createdAt)}
          </div>
        </div>

        {/* Unread indicator dot */}
        {notification.status === 'unread' && (
          <div className="w-2.5 h-2.5 bg-red-500 rounded-full flex-shrink-0 mt-1 mr-5" />
        )}
      </div>
    </div>
  )
}
