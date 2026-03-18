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

// LocalStorage keys for persisting notification states
const STORAGE_KEY_READ = 'au_notifications_read'
const STORAGE_KEY_RESOLVED = 'au_notifications_resolved'
const STORAGE_KEY_CLEARED = 'au_notifications_cleared'
const STORAGE_KEY_TIMESTAMPS = 'au_notifications_timestamps'
const STORAGE_KEY_INITIAL_LOAD = 'au_notifications_initial_load'

// Load Set from localStorage
function loadSetFromStorage(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set<string>()
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        return new Set<string>(parsed)
      }
    }
  } catch (e) {
    console.error(`Error loading ${key} from localStorage:`, e)
  }
  return new Set<string>()
}

// Load Map from localStorage
function loadMapFromStorage(key: string): Map<string, string> {
  if (typeof window === 'undefined') return new Map<string, string>()
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return new Map<string, string>(Object.entries(parsed))
      }
    }
  } catch (e) {
    console.error(`Error loading ${key} from localStorage:`, e)
  }
  return new Map<string, string>()
}

function saveToStorage(key: string, value: Set<string> | Map<string, string>) {
  if (typeof window === 'undefined') return
  try {
    if (value instanceof Set) {
      localStorage.setItem(key, JSON.stringify([...value]))
    } else if (value instanceof Map) {
      localStorage.setItem(key, JSON.stringify(Object.fromEntries(value)))
    }
  } catch (e) {
    console.error(`Error saving ${key} to localStorage:`, e)
  }
}

// Notification states persisted to localStorage

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
  resetAllNotifications: () => void
  createNotification: (data: Partial<NotificationRecord>) => Promise<void>
  checkInstructorConflict: (schedule: InstructorSchedule) => Promise<TimeConflictResult>
  addNewSection: (data: Partial<NotificationRecord>) => Promise<{ success: boolean; error?: string }>
}

// Module-level sets to track notification states (persisted to localStorage)
let readNotificationsSet: Set<string> = loadSetFromStorage(STORAGE_KEY_READ)
let resolvedNotificationsSet: Set<string> = loadSetFromStorage(STORAGE_KEY_RESOLVED)
let clearedNotificationsSet: Set<string> = loadSetFromStorage(STORAGE_KEY_CLEARED)
// Track when each notification was first seen (for sorting by newest first)
let notificationTimestamps: Map<string, string> = loadMapFromStorage(STORAGE_KEY_TIMESTAMPS)

// Load initial load flag from localStorage
function loadInitialLoadFlag(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const stored = localStorage.getItem(STORAGE_KEY_INITIAL_LOAD)
    if (stored !== null) {
      return stored === 'true'
    }
  } catch (e) {
    console.error(`Error loading ${STORAGE_KEY_INITIAL_LOAD} from localStorage:`, e)
  }
  return true
}

// Save initial load flag to localStorage
function saveInitialLoadFlag(value: boolean) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_INITIAL_LOAD, value.toString())
  } catch (e) {
    console.error(`Error saving ${STORAGE_KEY_INITIAL_LOAD} to localStorage:`, e)
  }
}

// Track seat values for ALL courses to detect transitions from >0 to 0
let prevSeatValues: Map<string, number> = new Map()
let isInitialNotificationLoad: boolean = loadInitialLoadFlag()
let notifiedCourseIds: Set<string> = new Set()

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

  // Update functions for module-level sets (with localStorage persistence)
  const updateReadNotifications = useCallback((ids: Set<string>) => {
    readNotificationsSet = ids
    saveToStorage(STORAGE_KEY_READ, ids)
  }, [])

  const updateResolvedNotifications = useCallback((ids: Set<string>) => {
    resolvedNotificationsSet = ids
    saveToStorage(STORAGE_KEY_RESOLVED, ids)
  }, [])

  const updateClearedNotifications = useCallback((ids: Set<string>) => {
    clearedNotificationsSet = ids
    saveToStorage(STORAGE_KEY_CLEARED, ids)
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
      saveToStorage(STORAGE_KEY_TIMESTAMPS, notificationTimestamps)
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
      courseId: record["Course ID"] || undefined,
      prefix: record["Prefix"] || undefined,
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
    if (hasFetchedOnce && !force) {
      return
    }

    // Only show loading on first fetch
    if (!hasFetchedOnce) {
      setIsLoading(true)
    }
    setError(null)
    
    try {
      // Fetch ALL courses to track seat transitions
      const { data: allData, error: fetchError } = await supabase
        .from(TEST_TABLE)
        .select('*')
        .order('Course Code', { ascending: true })

      if (fetchError) {
        throw fetchError
      }

      // Filter to full courses only for notifications
      const data = (allData || []).filter(r => r['Seat Left'] === 0)
      
      console.log(`[Notifications] Fetched from ${TEST_TABLE}: ${(allData || []).length} total courses, ${data.length} full`)

      const readSet = getReadNotifications()
      const resolvedSet = getResolvedNotifications()

      // Build current seat values map for ALL courses
      const currentSeatValues = new Map<string, number>()
      ;(allData || []).forEach(r => {
        const id = `${r["Course Code"]}-${r["Section"]}`
        currentSeatValues.set(id, r['Seat Left'])
      })

      // On initial load: store baseline seat values and mark initially-full courses as cleared
      if (isInitialNotificationLoad) {
        prevSeatValues = new Map(currentSeatValues)
        isInitialNotificationLoad = false
        saveInitialLoadFlag(false) // Persist to localStorage
        const fullCount = data.length
        console.log(`[Notifications] Initial load: stored ${currentSeatValues.size} course seat values, ${fullCount} already full`)
        
        // Mark all initially-full courses as cleared so they don't show in notifications
        // Only courses that become full during simulation will show
        const clearedSet = getClearedNotifications()
        data.forEach(r => {
          const id = `${r["Course Code"]}-${r["Section"]}`
          clearedSet.add(id)
          console.log(`[Notifications] Marking initially-full course as cleared: ${id}`)
        })
        updateClearedNotifications(clearedSet)
      } else {
        // Detect newly-full courses: prevSeat > 0 AND currentSeat === 0
        const newlyFull: string[] = []
        currentSeatValues.forEach((currentSeat, id) => {
          const prevSeat = prevSeatValues.get(id)
          // Course just became full (had seats before, now has 0)
          if (currentSeat === 0 && prevSeat !== undefined && prevSeat > 0) {
            if (!notifiedCourseIds.has(id)) {
              // Remove from cleared set so it can show as notification
              const clearedSet = getClearedNotifications()
              clearedSet.delete(id)
              updateClearedNotifications(clearedSet)
              
              readSet.delete(id)
              resolvedSet.delete(id)
              notifiedCourseIds.add(id)
              newlyFull.push(id)
            }
          }
          // Course reopened (had 0, now has seats) — allow re-notification
          if (currentSeat > 0 && prevSeat === 0) {
            notifiedCourseIds.delete(id)
            console.log(`[Notifications] Seat reopened: ${id} (${prevSeat} → ${currentSeat})`)
          }
        })
        
        if (newlyFull.length > 0) {
          console.log(`[Notifications] Newly full (transition >0→0):`, newlyFull)
        }
        
        // Update baseline
        prevSeatValues = new Map(currentSeatValues)
        updateReadNotifications(readSet)
        updateResolvedNotifications(resolvedSet)
      }
      
      // Map all full-course notifications from database
      const allMappedNotifications = data
        .map(record => recordToNotification(record, readSet, resolvedSet))
      
      // Get current cleared set
      let clearedSet = getClearedNotifications()
      
      // Filter out cleared notifications
      const mappedNotifications = allMappedNotifications.filter(n => !clearedSet.has(n.id))
      
      // MERGE with existing notifications instead of replacing
      // This preserves notifications added via the custom event
      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id))
        const fetchedIds = new Set(mappedNotifications.map(n => n.id))
        
        // Start with fetched notifications
        const merged = mappedNotifications.map(fetched => {
          // If this notification exists in current state and is unread, preserve that status
          const existing = prev.find(p => p.id === fetched.id)
          if (existing && existing.status === 'unread') {
            return { ...fetched, status: 'unread' as NotificationStatus, createdAt: existing.createdAt }
          }
          return fetched
        })
        
        // Add any notifications from prev that aren't in fetched (shouldn't happen normally, but safety)
        prev.forEach(p => {
          if (!fetchedIds.has(p.id) && p.status === 'unread') {
            // This was added via custom event but not yet in DB - keep it
            merged.unshift(p)
          }
        })
        
        return merged
      })
      setHasFetchedOnce(true)
    } catch (err: any) {
      console.error('Error fetching notifications:', err)
      setError(err.message || 'Failed to fetch notifications')
    } finally {
      setIsLoading(false)
    }
  }, [hasFetchedOnce, getReadNotifications, getResolvedNotifications, updateReadNotifications, updateResolvedNotifications, getClearedNotifications, recordToNotification])

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

  // Reset all notification states (called when admin restarts DB)
  const resetAllNotifications = useCallback(() => {
    // Clear all module-level sets
    readNotificationsSet = new Set<string>()
    resolvedNotificationsSet = new Set<string>()
    clearedNotificationsSet = new Set<string>()
    notificationTimestamps = new Map<string, string>()
    // Reset transition tracking
    prevSeatValues = new Map()
    isInitialNotificationLoad = true
    notifiedCourseIds = new Set()
    
    // Clear localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_READ)
      localStorage.removeItem(STORAGE_KEY_RESOLVED)
      localStorage.removeItem(STORAGE_KEY_CLEARED)
      localStorage.removeItem(STORAGE_KEY_TIMESTAMPS)
      localStorage.removeItem(STORAGE_KEY_INITIAL_LOAD)
    }
    
    // Reset state
    setNotifications([])
    setHasFetchedOnce(false)
  }, [])

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
        .from(TEST_TABLE)
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

  // Listen for COURSE_FULL_EVENT from useCourses (realtime seat transition detection)
  useEffect(() => {
    const handleCourseFull = (event: Event) => {
      const { courseId, courseCode, section, courseData } = (event as CustomEvent).detail
      console.log(`[Notifications] 🔔 Received COURSE_FULL_EVENT for ${courseId} - updating immediately`)
      
      // Mark this course as unread (remove from read set)
      const readSet = getReadNotifications()
      readSet.delete(courseId)
      updateReadNotifications(readSet)
      
      // Remove from notified set so it shows as new
      notifiedCourseIds.delete(courseId)
      
      // IMMEDIATELY update notifications state (no fetch delay)
      setNotifications(prev => {
        // Check if notification already exists
        const existingIndex = prev.findIndex(n => n.id === courseId)
        
        const newNotification: Notification = {
          id: courseId,
          type: 'COURSE_FULL' as NotificationType,
          title: `${courseCode} Section ${section} is now full`,
          message: courseData ? `Instructor: ${courseData['Instructor'] || 'TBA'}` : 'No seats available',
          status: 'unread' as NotificationStatus,
          createdAt: new Date().toISOString(),
          courseCode: courseCode,
          section: section,
          instructorName: courseData?.['Instructor'] || 'TBA',
          seatLimit: courseData?.['Seat Limit'] || 0,
          seatUsed: courseData?.['Seat Used'] || 0,
        }
        
        if (existingIndex >= 0) {
          // Update existing notification to unread
          const updated = [...prev]
          updated[existingIndex] = { ...updated[existingIndex], status: 'unread', createdAt: new Date().toISOString() }
          return updated
        } else {
          // Add new notification at the beginning
          return [newNotification, ...prev]
        }
      })
    }
    
    if (typeof window !== 'undefined') {
      window.addEventListener('course-became-full', handleCourseFull)
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('course-became-full', handleCourseFull)
      }
    }
  }, [getReadNotifications, updateReadNotifications])

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
    resetAllNotifications,
    createNotification,
    checkInstructorConflict,
    addNewSection,
  }
}
