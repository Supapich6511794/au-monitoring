'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase, createServerClient } from '@/lib/supabase'
import { Course, NormalizedCourse, CourseGroup, FilterState, DAYS } from '@/lib/types'
import { normalizeCourse, toMinutes } from '@/lib/utils'

// Module-level tracking for seat transitions (shared across hook instances)
let prevSeatValuesMap: Map<string, number> = new Map()
let isFirstLoad = true

// Custom event for newly-full courses
export const COURSE_FULL_EVENT = 'course-became-full'
export function dispatchCourseFullEvent(courseId: string, courseCode: string, section: string, courseData?: any) {
  if (typeof window !== 'undefined') {
    console.log(`[useCourses] 🔔 Dispatching COURSE_FULL_EVENT for ${courseId}`)
    window.dispatchEvent(new CustomEvent(COURSE_FULL_EVENT, {
      detail: { courseId, courseCode, section, courseData }
    }))
  }
}

// Get the appropriate client - use server client if available for bypassing RLS
const getClient = () => {
  if (typeof window === 'undefined') {
    return createServerClient()
  }
  return supabase
}

const PROD_TABLE = 'data_vme'
const TEST_TABLE = 'data_vme_test'

export type DatabaseMode = 'default' | 'test'

export function useCourses(initialDatabaseMode: DatabaseMode = 'default') {
  const [rawCourses, setRawCourses] = useState<Course[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSimulatorRunning, setIsSimulatorRunning] = useState(false)
  const [databaseMode, setDatabaseModeState] = useState<DatabaseMode>(initialDatabaseMode)
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    session: 'ALL',
    activeDay: 'ALL',
  })

  // Derive currentTable from databaseMode
  const currentTable = databaseMode === 'test' ? TEST_TABLE : PROD_TABLE

  // Check simulator status (for display purposes only, doesn't auto-switch)
  useEffect(() => {
    const checkSimulatorStatus = async () => {
      try {
        const res = await fetch('/api/simulator/status')
        if (res.ok) {
          const data = await res.json()
          setIsSimulatorRunning(data.isRunning)
        }
      } catch (error) {
        // Ignore errors
      }
    }

    checkSimulatorStatus()
    const interval = setInterval(checkSimulatorStatus, 2000)
    return () => clearInterval(interval)
  }, [])

  // Fetch courses via API (bypasses RLS with service role key)
  const fetchCourses = useCallback(async () => {
    const tableToFetch = databaseMode === 'test' ? TEST_TABLE : PROD_TABLE
    console.log('[useCourses] fetchCourses called, fetching from:', tableToFetch)
    setIsLoading(true)
    setError(null)

    try {
      // Use API route to fetch courses (server-side with service role key)
      const response = await fetch(`/api/courses?table=${tableToFetch}`)
      const result = await response.json()

      if (!response.ok || result.error) {
        console.error('API fetch error:', result.error)
        setError(result.error || 'Failed to fetch courses')
        setIsLoading(false)
        return
      }

      console.log('[useCourses] Fetched', result.count, 'courses from', tableToFetch)
      
      // Initialize seat tracking on first load
      const courses = (result.data || []).filter(Boolean) as Course[]
      if (isFirstLoad) {
        prevSeatValuesMap.clear()
        courses.forEach(c => {
          const id = `${c['Course Code']}-${c['Section']}`
          prevSeatValuesMap.set(id, c['Seat Left'])
        })
        isFirstLoad = false
        console.log(`[useCourses] Initialized seat tracking for ${prevSeatValuesMap.size} courses`)
      }
      
      setRawCourses(courses)
      setIsLoading(false)
    } catch (error) {
      console.error('Unexpected fetch error:', error)
      setError('Failed to fetch courses')
      setIsLoading(false)
    }
  }, [databaseMode])

  // Initial fetch
  useEffect(() => {
    fetchCourses()
  }, [fetchCourses])

  // Re-fetch when databaseMode changes
  useEffect(() => {
    console.log('[useCourses] databaseMode changed to:', databaseMode, '- fetching...')
    fetchCourses()
  }, [databaseMode, fetchCourses])

  // Subscribe to real-time updates for live seat changes
  useEffect(() => {
    console.log('[useCourses] Setting up realtime subscription for table:', currentTable)
    
    const channel = supabase
      .channel(`courses-realtime-${currentTable}-${Date.now()}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: currentTable 
        },
        (payload) => {
          console.log('[useCourses] Realtime event received:', payload.eventType, payload)
          
          if (payload.eventType === 'INSERT') {
            console.log('[useCourses] INSERT - New course added')
            setRawCourses(prev => [...prev, payload.new as Course])
          } else if (payload.eventType === 'UPDATE') {
            const updatedCourse = payload.new as Course
            const courseId = `${updatedCourse['Course Code']}-${updatedCourse['Section']}`
            const newSeatLeft = updatedCourse['Seat Left']
            const prevSeatLeft = prevSeatValuesMap.get(courseId)
            
            console.log('[useCourses] UPDATE - Course:', updatedCourse['Course Code'], 
              'Section:', updatedCourse['Section'],
              'Seat Left:', prevSeatLeft, '→', newSeatLeft)
            
            // Detect transition from >0 to 0 (course just became full)
            if (prevSeatLeft !== undefined && prevSeatLeft > 0 && newSeatLeft === 0) {
              console.log(`[useCourses] 🚨 Course ${courseId} just became FULL!`)
              dispatchCourseFullEvent(courseId, updatedCourse['Course Code'], updatedCourse['Section'], updatedCourse)
            }
            
            // Update tracking
            prevSeatValuesMap.set(courseId, newSeatLeft)
            
            // Find and update the specific course
            setRawCourses(prev => {
              const updated = prev.map(c => 
                c['Course Code'] === updatedCourse['Course Code'] &&
                c['Section'] === updatedCourse['Section']
                  ? updatedCourse 
                  : c
              )
              return updated
            })
          } else if (payload.eventType === 'DELETE') {
            console.log('[useCourses] DELETE - Course removed')
            setRawCourses(prev => 
              prev.filter(c => c['Course Code'] !== (payload.old as Course)['Course Code'])
            )
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[useCourses] Realtime subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('[useCourses] ✅ Successfully subscribed to realtime updates')
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('[useCourses] ⚠️ Realtime channel error (will retry):', err?.message || 'Unknown error')
        } else if (status === 'TIMED_OUT') {
          console.warn('[useCourses] ⚠️ Realtime subscription timed out')
        } else if (status === 'CLOSED') {
          console.log('[useCourses] Realtime channel closed')
        }
      })

    return () => {
      console.log('[useCourses] Cleaning up realtime subscription for:', currentTable)
      supabase.removeChannel(channel)
    }
  }, [currentTable])

  // Normalize courses
  const normalizedCourses = useMemo(() => {
    return rawCourses.map(normalizeCourse)
  }, [rawCourses])

  // Apply filters
  const filteredCourses = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    const ses = filters.session

    return normalizedCourses.filter(course => {
      const code = (course.code || '').toLowerCase()
      const prefix = (course.prefix || '').toLowerCase()
      const okQ = !q || code.startsWith(q) || prefix === q
      const okS = ses === 'ALL' || course.session === ses
      return okQ && okS
    })
  }, [normalizedCourses, filters.search, filters.session])

  // Group overlapping courses by day
  const groupedByDay = useMemo(() => {
    const grouped: Record<string, CourseGroup[]> = {}

    for (const day of DAYS) {
      const rows = filteredCourses.filter(r => r.day === day)

      // Sort by start time, then end time
      rows.sort((a, b) => {
        const sa = toMinutes(a.start) || 0
        const sb = toMinutes(b.start) || 0
        if (sa !== sb) return sa - sb
        const ea = toMinutes(a.end) || 0
        const eb = toMinutes(b.end) || 0
        return ea - eb
      })

      const groups: CourseGroup[] = []

      for (const row of rows) {
        const s = toMinutes(row.start)
        const e = toMinutes(row.end)

        // Skip rows with missing times or non-positive duration
        if (s == null || e == null || e <= s) continue

        let placed = false
        for (const g of groups) {
          if (s < g.max && e > g.min) {
            g.items.push(row)
            g.min = Math.min(g.min, s)
            g.max = Math.max(g.max, e)
            placed = true
            break
          }
        }

        if (!placed) {
          groups.push({ min: s, max: e, items: [row], visibleIndex: 0 })
        }
      }

      // Set visible index to longest duration course
      groups.forEach(g => {
        g.visibleIndex = g.items.reduce((best, it, idx) => {
          const dur = (toMinutes(it.end) || 0) - (toMinutes(it.start) || 0)
          const bestDur = (toMinutes(g.items[best].end) || 0) - (toMinutes(g.items[best].start) || 0)
          return dur > bestDur ? idx : best
        }, 0)
      })

      grouped[day] = groups
    }

    return grouped
  }, [filteredCourses])

  // Update filters
  const setSearch = useCallback((search: string) => {
    setFilters(prev => ({ ...prev, search }))
  }, [])

  const setSession = useCallback((session: FilterState['session']) => {
    setFilters(prev => ({ ...prev, session }))
  }, [])

  const setActiveDay = useCallback((activeDay: string) => {
    setFilters(prev => ({ ...prev, activeDay }))
  }, [])

  // Set database mode (triggers re-fetch via useEffect)
  const setDatabaseMode = useCallback((mode: DatabaseMode) => {
    setDatabaseModeState(mode)
  }, [])

  return {
    courses: normalizedCourses,
    filteredCourses,
    groupedByDay,
    isLoading,
    error,
    filters,
    setSearch,
    setSession,
    setActiveDay,
    refresh: fetchCourses,
    isSimulatorRunning,
    currentTable,
    databaseMode,
    setDatabaseMode,
  }
}
