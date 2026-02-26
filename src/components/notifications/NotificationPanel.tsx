'use client'

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { 
  X, 
  CheckCheck, 
  RefreshCw,
  Inbox,
  Trash2,
  AlertTriangle
} from 'lucide-react'
import { NotificationItem } from './NotificationItem'
import { AddSectionModal } from './AddSectionModal'
import { useNotifications } from '@/hooks/useNotifications'
import { Notification } from '@/types/notification'
import { cn } from '@/lib/utils'

interface NotificationPanelProps {
  isOpen: boolean
  onClose: () => void
  onViewCourse?: (courseCode: string, section?: string) => void
}

type FilterType = 'all' | 'unread' | 'course_full'

export function NotificationPanel({ isOpen, onClose, onViewCourse }: NotificationPanelProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { 
    notifications, 
    unreadCount, 
    isLoading,
    hasFetchedOnce,
    fetchNotifications, 
    markAsRead, 
    markAllAsRead,
    markAsResolved,
    clearNotification,
    clearAllNotifications,
    addNewSection
  } = useNotifications()

  const [filter, setFilter] = useState<FilterType>('all')
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Close dropdown when clicking outside
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

  // Filter notifications with useMemo for performance
  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      if (filter === 'unread') return n.status === 'unread'
      if (filter === 'course_full') return n.type === 'COURSE_FULL'
      return true
    })
  }, [notifications, filter])

  // Handlers with useCallback
  const handleAddSection = useCallback((notification: Notification) => {
    setSelectedNotification(notification)
    setIsAddSectionOpen(true)
  }, [])

  const handleViewCourse = useCallback((notification: Notification) => {
    if (onViewCourse && notification.courseCode) {
      onViewCourse(notification.courseCode, notification.section)
      onClose()
    }
  }, [onViewCourse, onClose])

  const handleSectionAdded = useCallback(async (notificationId: string) => {
    await markAsResolved(notificationId)
    setIsAddSectionOpen(false)
    setSelectedNotification(null)
  }, [markAsResolved])

  const handleClearNotification = useCallback((id: string) => {
    clearNotification(id)
  }, [clearNotification])

  const handleClearAll = useCallback(() => {
    setShowClearConfirm(true)
  }, [])

  const confirmClearAll = useCallback(() => {
    clearAllNotifications()
    setShowClearConfirm(false)
  }, [clearAllNotifications])

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await fetchNotifications(true)
    setIsRefreshing(false)
  }, [fetchNotifications])

  return (
    <>
      {/* Dropdown Panel - Facebook Style */}
      <div
        ref={dropdownRef}
        className={`
          absolute top-full right-0 mt-2 w-96
          bg-white rounded-2xl shadow-2xl border border-gray-200
          transform transition-all duration-200 ease-out origin-top-right
          flex flex-col
          ${isOpen 
            ? 'opacity-100 scale-100 translate-y-0' 
            : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
          }
        `}
        style={{ zIndex: 100, maxHeight: '80vh' , width: '404px'}}
      >
        {/* Sticky Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white rounded-t-2xl sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-lg text-gray-900">Notifications</h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-600 rounded-full">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className="p-1.5 hover:bg-red-50 rounded-full transition-colors group"
                title="Clear all"
              >
                <Trash2 className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" />
              </button>
            )}
            <button
              onClick={handleManualRefresh}
              className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
              title="Refresh"
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("w-4 h-4 text-gray-500", isRefreshing && "animate-spin")} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
              title="Close"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Clear All Confirmation */}
        {showClearConfirm && (
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs font-medium">Clear all notifications?</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-2 py-1 text-xs text-gray-600 hover:bg-amber-100 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearAll}
                className="px-2 py-1 text-xs bg-red-500 text-white hover:bg-red-600 rounded transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50/50 sticky top-[52px] z-10">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full transition-colors",
              filter === 'all' 
                ? "bg-red-600 text-white" 
                : "text-gray-600 hover:bg-gray-200"
            )}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1",
              filter === 'unread' 
                ? "bg-red-600 text-white" 
                : "text-gray-600 hover:bg-gray-200"
            )}
          >
            Unread
            {unreadCount > 0 && (
              <span className={cn(
                "px-1.5 py-0.5 text-[10px] rounded-full",
                filter === 'unread' ? "bg-white/20" : "bg-red-100 text-red-600"
              )}>
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilter('course_full')}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full transition-colors",
              filter === 'course_full' 
                ? "bg-red-600 text-white" 
                : "text-gray-600 hover:bg-gray-200"
            )}
          >
            Course Full
          </button>
          
          {/* Mark all as read */}
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="ml-auto flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-red-600 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {/* Notification list - scrollable */}
        <div 
          ref={scrollContainerRef}
          className="overflow-y-auto flex-1" 
          style={{ maxHeight: 'calc(80vh - 160px)' }}
        >
          {isLoading && !hasFetchedOnce ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <Inbox className="w-10 h-10 mb-2" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredNotifications.map(notification => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={markAsRead}
                  onAddSection={handleAddSection}
                  onViewCourse={handleViewCourse}
                  onClear={handleClearNotification}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <p className="text-xs text-gray-500 text-center">
            {filteredNotifications.length} of {notifications.length} notifications
          </p>
        </div>
      </div>

      {/* Add Section Modal */}
      {selectedNotification && (
        <AddSectionModal
          isOpen={isAddSectionOpen}
          onClose={() => {
            setIsAddSectionOpen(false)
            setSelectedNotification(null)
          }}
          notification={selectedNotification}
          onSuccess={() => handleSectionAdded(selectedNotification.id)}
          addNewSection={addNewSection}
        />
      )}
    </>
  )
}
