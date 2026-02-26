'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  Notification, 
  NotificationRecord, 
  NotificationType, 
  NotificationStatus,
  TimeConflictResult,
  InstructorSchedule 
} from '@/types/notification'

const TEST_TABLE = 'data_vme_test'
const PLANNER_TABLE = 'data_vme_planner'

// All notification states are stored in memory only (resets on page refresh/new simulation)

interface UseNotificationsReturn {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean
  hasFetchedOnce: boolean
  error: string | null
  fetchNotifications: (force?: boolean) => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  markAsResolved: (id: string) => Promise<void>
  clearNotification: (id: string) => void
  clearAllNotifications: () => void
  createNotification: (data: Partial<NotificationRecord>) => Promise<void>
  checkInstructorConflict: (schedule: InstructorSchedule) => Promise<TimeConflictResult>
  addNewSection: (data: Partial<NotificationRecord>) => Promise<{ success: boolean; error?: string }>
}

// Module-level sets to track notification states (resets on page refresh)
let readNotificationsSet = new Set<string>()
let resolvedNotificationsSet = new Set<string>()
let clearedNotificationsSet = new Set<string>()
// Track when each notification was first seen (for sorting by newest first)
let notificationTimestamps = new Map<string, string>()

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get read notifications from module-level set (session-only)
  const getReadNotifications = useCallback((): Set<string> => {
    return readNotificationsSet
  }, [])

  // Get resolved notifications from module-level set (session-only)
  const getResolvedNotifications = useCallback((): Set<string> => {
    return resolvedNotificationsSet
  }, [])

  // Get cleared notifications from module-level set (session-only)
  const getClearedNotifications = useCallback((): Set<string> => {
    return clearedNotificationsSet
  }, [])

  // Update functions for module-level sets
  const updateReadNotifications = useCallback((ids: Set<string>) => {
    readNotificationsSet = ids
  }, [])

  const updateResolvedNotifications = useCallback((ids: Set<string>) => {
    resolvedNotificationsSet = ids
  }, [])

  const updateClearedNotifications = useCallback((ids: Set<string>) => {
    clearedNotificationsSet = ids
  }, [])

  // Convert database record to Notification type
  const recordToNotification = useCallback((record: any, readSet: Set<string>, resolvedSet: Set<string>): Notification => {
    const id = `${record["Course Code"]}-${record["Section"]}`
    let status: NotificationStatus = 'unread'
    if (resolvedSet.has(id)) {
      status = 'resolved'
    } else if (readSet.has(id)) {
      status = 'read'
    }

    // Track when this notification was first seen (for sorting)
    // If not seen before, record current timestamp
    if (!notificationTimestamps.has(id)) {
      notificationTimestamps.set(id, new Date().toISOString())
    }
    const createdAt = notificationTimestamps.get(id) || new Date().toISOString()

    return {
      id,
      type: 'COURSE_FULL' as NotificationType,
      title: `${record["Course Code"]} - ${record["Course Title"] || 'Unknown Course'}`,
      message: `Course is FULL (${record["Seat Limit"]} seats)`,
      status,
      courseCode: record["Course Code"],
      courseTitle: record["Course Title"] || undefined,
      section: record["Section"] || undefined,
      seatLimit: record["Seat Limit"] || undefined,
      seatUsed: record["Seat Used"] || undefined,
      instructorName: record["Instructor Name"] || undefined,
      day: record["Day"] || undefined,
      startTime: record["Start Time"] || undefined,
      endTime: record["End Time"] || undefined,
      createdAt,
      readAt: readSet.has(id) ? new Date().toISOString() : undefined,
      resolvedAt: resolvedSet.has(id) ? new Date().toISOString() : undefined,
    }
  }, [])

  // Fetch all full courses from data_vme_test as notifications
  const fetchNotifications = useCallback(async (force: boolean = false) => {
    // Skip if already fetched and not forced
    if (hasFetchedOnce && !force && notifications.length > 0) {
      return
    }

    // Only show loading on first fetch
    if (!hasFetchedOnce) {
      setIsLoading(true)
    }
    setError(null)
    
    try {
      // Fetch courses where Seat Left = 0 (full courses)
      const { data, error: fetchError } = await supabase
        .from(TEST_TABLE)
        .select('*')
        .eq('Seat Left', 0)
        .order('Course Code', { ascending: true })

      if (fetchError) {
        throw fetchError
      }

      const readSet = getReadNotifications()
      const resolvedSet = getResolvedNotifications()
      
      // Map all notifications from database
      const allMappedNotifications = (data || [])
        .map(record => recordToNotification(record, readSet, resolvedSet))
      
      // Get current cleared set
      let clearedSet = getClearedNotifications()
      
      // If database has full courses but they're all in cleared set,
      // this likely means simulation was reset - clear all session states
      if (allMappedNotifications.length > 0) {
        const allCleared = allMappedNotifications.every(n => clearedSet.has(n.id))
        if (allCleared && clearedSet.size > 0) {
          // Reset all session states - new simulation run
          clearedSet = new Set<string>()
          updateClearedNotifications(clearedSet)
          updateReadNotifications(new Set<string>())
          updateResolvedNotifications(new Set<string>())
          // Also reset timestamps so new notifications get fresh timestamps
          notificationTimestamps = new Map<string, string>()
        }
      }
      
      // Filter out cleared notifications
      const mappedNotifications = allMappedNotifications.filter(n => !clearedSet.has(n.id))
      
      setNotifications(mappedNotifications)
      setHasFetchedOnce(true)
    } catch (err: any) {
      console.error('Error fetching notifications:', err)
      setError(err.message || 'Failed to fetch notifications')
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFetchedOnce, notifications.length])

  // Use ref to avoid recreating subscription on every render
  const fetchNotificationsRef = useRef(fetchNotifications)
  fetchNotificationsRef.current = fetchNotifications

  // Mark a single notification as read (session-based)
  const markAsRead = useCallback(async (id: string) => {
    try {
      const readSet = getReadNotifications()
      readSet.add(id)
      updateReadNotifications(readSet)

      setNotifications(prev => 
        prev.map(n => 
          n.id === id 
            ? { ...n, status: 'read' as NotificationStatus, readAt: new Date().toISOString() }
            : n
        )
      )
    } catch (err: any) {
      console.error('Error marking notification as read:', err)
    }
  }, [getReadNotifications, updateReadNotifications])

  // Mark all notifications as read (session-based)
  const markAllAsRead = useCallback(async () => {
    try {
      const readSet = getReadNotifications()
      notifications.forEach(n => {
        if (n.status === 'unread') {
          readSet.add(n.id)
        }
      })
      updateReadNotifications(readSet)

      setNotifications(prev => 
        prev.map(n => ({ 
          ...n, 
          status: n.status === 'resolved' ? 'resolved' : 'read' as NotificationStatus, 
          readAt: new Date().toISOString() 
        }))
      )
    } catch (err: any) {
      console.error('Error marking all notifications as read:', err)
    }
  }, [notifications, getReadNotifications, updateReadNotifications])

  // Mark notification as resolved (session-based)
  const markAsResolved = useCallback(async (id: string) => {
    try {
      const resolvedSet = getResolvedNotifications()
      resolvedSet.add(id)
      updateResolvedNotifications(resolvedSet)

      setNotifications(prev => 
        prev.map(n => 
          n.id === id 
            ? { ...n, status: 'resolved' as NotificationStatus, resolvedAt: new Date().toISOString() }
            : n
        )
      )
    } catch (err: any) {
      console.error('Error marking notification as resolved:', err)
    }
  }, [getResolvedNotifications, updateResolvedNotifications])

  // Clear a single notification (UI only - session-based)
  const clearNotification = useCallback((id: string) => {
    // Optimistic update - remove from UI immediately
    setNotifications(prev => prev.filter(n => n.id !== id))
    
    // Add to session-based cleared set
    const clearedSet = getClearedNotifications()
    clearedSet.add(id)
    updateClearedNotifications(clearedSet)
  }, [getClearedNotifications, updateClearedNotifications])

  // Clear all notifications (UI only - session-based)
  const clearAllNotifications = useCallback(() => {
    // Add all current notification IDs to cleared set
    const clearedSet = getClearedNotifications()
    notifications.forEach(n => clearedSet.add(n.id))
    updateClearedNotifications(clearedSet)
    
    // Clear UI immediately
    setNotifications([])
  }, [notifications, getClearedNotifications, updateClearedNotifications])

  // Create a new notification - not needed since we read from data_vme_test
  // This is kept for API compatibility but just refreshes the list
  const createNotification = useCallback(async (_data: Partial<NotificationRecord>) => {
    // Just refresh notifications from data_vme_test
    await fetchNotifications()
  }, [fetchNotifications])

  // Check for instructor time conflicts
  const checkInstructorConflict = useCallback(async (
    schedule: InstructorSchedule
  ): Promise<TimeConflictResult> => {
    try {
      // Fetch all courses for this instructor on the same day
      const { data, error: fetchError } = await supabase
        .from(PLANNER_TABLE)
        .select('*')
        .eq('Instructor Name', schedule.instructorName)
        .eq('Day', schedule.day)

      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        return { hasConflict: false }
      }

      // Parse time strings to minutes for comparison
      const parseTime = (timeStr: string): number => {
        const [hours, minutes] = timeStr.split(':').map(Number)
        return hours * 60 + minutes
      }

      const newStart = parseTime(schedule.startTime)
      const newEnd = parseTime(schedule.endTime)

      // Check for overlaps
      for (const course of data) {
        const existingStart = parseTime(course["Start Time"])
        const existingEnd = parseTime(course["End Time"])

        // Check if times overlap
        // Overlap occurs if: newStart < existingEnd AND newEnd > existingStart
        if (newStart < existingEnd && newEnd > existingStart) {
          return {
            hasConflict: true,
            conflictingCourse: {
              courseCode: course["Course Code"],
              section: course["Section"],
              day: course["Day"],
              startTime: course["Start Time"],
              endTime: course["End Time"],
            },
            message: `Instructor "${schedule.instructorName}" is already assigned to ${course["Course Code"]} Section ${course["Section"]} at ${course["Start Time"]} - ${course["End Time"]} on ${course["Day"]}.`
          }
        }
      }

      return { hasConflict: false }
    } catch (err: any) {
      console.error('Error checking instructor conflict:', err)
      return { 
        hasConflict: false, 
        message: 'Could not verify instructor schedule' 
      }
    }
  }, [])

  // Add a new section to the planner table
  const addNewSection = useCallback(async (
    data: Partial<NotificationRecord>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // First check for instructor conflicts
      if (data["Instructor Name"] && data["Day"] && data["Start Time"] && data["End Time"]) {
        const conflictResult = await checkInstructorConflict({
          instructorName: data["Instructor Name"],
          day: data["Day"],
          dayNumber: data["Day Number"] || 0,
          startTime: data["Start Time"],
          endTime: data["End Time"],
          courseCode: data["Course Code"] || '',
          section: data["Section"] || '',
        })

        if (conflictResult.hasConflict) {
          return { 
            success: false, 
            error: conflictResult.message || 'Instructor has a time conflict' 
          }
        }
      }

      // Insert the new section
      const newSection = {
        ...data,
        "Order": Date.now(),
        "Seat Used": 0,
        "Seat Left": data["Seat Limit"] || 0,
      }

      const { error: insertError } = await supabase
        .from(PLANNER_TABLE)
        .insert([newSection])

      if (insertError) throw insertError

      return { success: true }
    } catch (err: any) {
      console.error('Error adding new section:', err)
      return { 
        success: false, 
        error: err.message || 'Failed to add new section' 
      }
    }
  }, [checkInstructorConflict])

  // Sort notifications by createdAt DESC (latest first) and calculate unread count
  const sortedNotifications = useMemo(() => {
    return [...notifications].sort((a, b) => {
      // Sort by createdAt descending (newest first)
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      return dateB - dateA
    })
  }, [notifications])

  const unreadCount = useMemo(() => {
    return notifications.filter(n => n.status === 'unread').length
  }, [notifications])

  // Initial fetch and real-time subscription to data_vme_test
  useEffect(() => {
    // Initial fetch (force on mount)
    fetchNotificationsRef.current(true)

    // Subscribe to real-time updates on data_vme_test table
    const channel = supabase
      .channel('notifications-test-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TEST_TABLE },
        (payload) => {
          console.log('[Notifications] Realtime event on data_vme_test:', payload.eventType)
          // Force refetch when new data arrives
          fetchNotificationsRef.current(true)
        }
      )
      .subscribe((status) => {
        console.log('[Notifications] Subscription status:', status)
      })

    // Poll every 10 seconds as a fallback (less aggressive)
    const pollInterval = setInterval(() => {
      fetchNotificationsRef.current(true)
    }, 10000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [])

  return {
    notifications: sortedNotifications,
    unreadCount,
    isLoading,
    hasFetchedOnce,
    error,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    markAsResolved,
    clearNotification,
    clearAllNotifications,
    createNotification,
    checkInstructorConflict,
    addNewSection,
  }
}
