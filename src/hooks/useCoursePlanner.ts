'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase, createServerClient } from '@/lib/supabase'
import { Course, NormalizedCourse, CourseGroup, FilterState, DAYS } from '@/lib/types'
import { normalizeCourse, toMinutes } from '@/lib/utils'

// Course Planner uses a separate table: data_vme_planner
const PLANNER_TABLE = 'data_vme_planner'

export function useCoursePlanner() {
  const [rawCourses, setRawCourses] = useState<Course[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    session: 'ALL',
    activeDay: 'ALL',
  })

  // Fetch courses via API (bypasses RLS with service role key)
  const fetchCourses = useCallback(async () => {
    console.log('[useCoursePlanner] fetchCourses called, fetching from:', PLANNER_TABLE)
    setIsLoading(true)
    setError(null)

    try {
      // Use API route to fetch courses (server-side with service role key)
      const response = await fetch(`/api/courses?table=${PLANNER_TABLE}`)
      const result = await response.json()

      if (!response.ok || result.error) {
        console.error('API fetch error:', result.error)
        setError(result.error || 'Failed to fetch courses')
        setIsLoading(false)
        return
      }

      console.log('[useCoursePlanner] Fetched', result.count, 'courses from', PLANNER_TABLE)
      setRawCourses((result.data || []).filter(Boolean) as Course[])
      setIsLoading(false)
    } catch (error) {
      console.error('Unexpected fetch error:', error)
      setError('Failed to fetch courses')
      setIsLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchCourses()
  }, [fetchCourses])

  // Subscribe to real-time updates for live seat changes
  useEffect(() => {
    console.log('[useCoursePlanner] Setting up realtime subscription for table:', PLANNER_TABLE)
    
    const channel = supabase
      .channel(`planner-realtime-${PLANNER_TABLE}-${Date.now()}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: PLANNER_TABLE 
        },
        (payload) => {
          console.log('[useCoursePlanner] Realtime event received:', payload.eventType, payload)
          
          if (payload.eventType === 'INSERT') {
            console.log('[useCoursePlanner] INSERT - New course added')
            setRawCourses(prev => [...prev, payload.new as Course])
          } else if (payload.eventType === 'UPDATE') {
            const updatedCourse = payload.new as Course
            console.log('[useCoursePlanner] UPDATE - Course:', updatedCourse['Course Code'], 
              'Section:', updatedCourse['Section'],
              'Seat Used:', updatedCourse['Seat Used'],
              'Seat Left:', updatedCourse['Seat Left'])
            
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
            console.log('[useCoursePlanner] DELETE - Course removed')
            setRawCourses(prev => 
              prev.filter(c => 
                !(c['Course Code'] === (payload.old as Course)['Course Code'] &&
                  c['Section'] === (payload.old as Course)['Section'])
              )
            )
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[useCoursePlanner] Realtime subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('[useCoursePlanner] ✅ Successfully subscribed to realtime updates')
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('[useCoursePlanner] ⚠️ Realtime channel error (will retry):', err?.message || 'Unknown error')
        }
      })

    return () => {
      console.log('[useCoursePlanner] Cleaning up realtime subscription for:', PLANNER_TABLE)
      supabase.removeChannel(channel)
    }
  }, [])

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
    currentTable: PLANNER_TABLE,
  }
}
