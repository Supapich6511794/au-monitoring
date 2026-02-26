'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useCoursePlanner } from '@/hooks/useCoursePlanner'
import { DAYS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { RefreshCw, Search, SlidersHorizontal, X, Plus, Trash2, Edit } from 'lucide-react'
import { CSVCourse } from './CourseBlock'
import { CourseDetailEditor } from './CourseDetailEditor'
import { CourseGroup as SupabaseCourseGroup } from '@/lib/types'
import { SwimlaneSchedule } from './SwimlaneSchedule'
import { AnimatedNumber } from './AnimatedNumber'
import { AddClassModalPlanner } from './AddClassModalPlanner'
import { EditClassModalPlanner } from './EditClassModalPlanner'
import { useAuth } from '@/hooks/useAuth'
import { Portal } from './Portal'


// Time axis configuration
const START_MIN = 7 * 60 + 30  // 07:30
const STEP_MIN = 90            // 1.5 hours
const CELLS = 9                // 07:30 to 21:00 (remove 21:00 tick)
const END_MIN = START_MIN + CELLS * STEP_MIN  // 21:00
const SPAN_MIN = END_MIN - START_MIN

// Convert time string to minutes
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

// Format time string to HH:MM (removes seconds if present)
function formatTime(time: string): string {
  if (!time) return ''
  const parts = time.split(':')
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`
  }
  return time
}

// Course with layer assignment for overlap stacking
interface CourseWithLayer extends CSVCourse {
  layer: number
}

// Result of processing courses for a day
interface DayCoursesResult {
  courses: CourseWithLayer[]
  maxLayers: number
}

// Assign layer indices to courses based on time overlap
// Uses greedy algorithm: assign each course to the lowest available layer
function assignCourseLayers(courses: CSVCourse[]): DayCoursesResult {
  if (courses.length === 0) return { courses: [], maxLayers: 0 }
  
  // Sort by start time, then by end time
  const sorted = [...courses].sort((a, b) => {
    const startDiff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    if (startDiff !== 0) return startDiff
    return timeToMinutes(a.endTime) - timeToMinutes(b.endTime)
  })
  
  // Track end times for each layer
  const layerEndTimes: number[] = []
  const result: CourseWithLayer[] = []
  
  for (const course of sorted) {
    const courseStart = timeToMinutes(course.startTime)
    const courseEnd = timeToMinutes(course.endTime)
    
    // Find the first layer where this course doesn't overlap
    let assignedLayer = -1
    for (let i = 0; i < layerEndTimes.length; i++) {
      if (layerEndTimes[i] <= courseStart) {
        assignedLayer = i
        break
      }
    }
    
    // If no existing layer is available, create a new one
    if (assignedLayer === -1) {
      assignedLayer = layerEndTimes.length
      layerEndTimes.push(0)
    }
    
    // Update the layer's end time
    layerEndTimes[assignedLayer] = courseEnd
    
    // Add course with layer assignment
    result.push({
      ...course,
      layer: assignedLayer
    })
  }
  
  return {
    courses: result,
    maxLayers: layerEndTimes.length
  }
}

// Legacy interface for compatibility
interface CourseGroup {
  courses: CSVCourse[]
  startMin: number
  endMin: number
}

// Centralized glow configuration - Change this number to adjust all glow sizes
const GLOW_SIZE = 'md' // Options: 'sm', '', 'md', 'lg', 'xl', '2xl'

export function CoursePlanner() {
  const { user } = useAuth()
  const [glowingCourses, setGlowingCourses] = useState<Set<string>>(new Set())
  const glowTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  
  // Add Class Modal state
  const [showAddClassModal, setShowAddClassModal] = useState(false)
  
  // Edit Class Modal state
  const [showEditClassModal, setShowEditClassModal] = useState(false)
  const [editingCourse, setEditingCourse] = useState<{
    courseCode: string
    section: string
    prefix?: string
    courseTitle?: string
    seatLimit?: number
    seatUsed?: number
    seatLeft?: number
    startTime?: string
    endTime?: string
    instructorName?: string
    remark?: string
    session?: string
    day?: string
  } | null>(null)
  
  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{courseCode: string, section: string} | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState<{type: 'success' | 'error', text: string} | null>(null)
  
  const {
    groupedByDay,
    isLoading,
    filters,
    setSearch,
    setActiveDay,
    refresh,
  } = useCoursePlanner()

  // Timetable_Move function state - slide positions
  const [allSlidePos, setAllSlidePos] = useState(0) // ALL timetable position: 0 = center, 200 = off right
  const [daySlidePos, setDaySlidePos] = useState(-100) // Day timetable position: -100 = off left, 0 = center
  const [showAllTimetable, setShowAllTimetable] = useState(true)
  const [showDayTimetable, setShowDayTimetable] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  // Selected course group for detail panel (Option C)
  // Store course identifiers instead of full data so we can look up latest data
  const [selectedGroupIds, setSelectedGroupIds] = useState<{courseCode: string, section: string}[] | null>(null)

  // Search dropdown state
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)

  // Advanced filter state
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false)
  const [advancedFilters, setAdvancedFilters] = useState({
    prefix: '',
    seatMin: '',
    seatMax: '',
    timeStart: '',
    timeEnd: '',
    section: '',
    instructor: '',
  })
  const filterRef = useRef<HTMLDivElement>(null)

  // Prevent body scroll when popup is open
  useEffect(() => {
    if (selectedGroupIds) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [selectedGroupIds])

  // Popup width in pixels for edge-to-edge snapping
  const POPUP_WIDTH = 275

  // Handle course block click - show detail panel
  const handleCourseClick = (group: CSVCourse[]) => {
    // Store only identifiers so we can look up latest data
    setSelectedGroupIds(group.map(c => ({ courseCode: c.courseCode, section: c.section })))
  }

  // Close detail panel
  const closeDetailPanel = () => {
    setSelectedGroupIds(null)
  }

  // Handle day change with slide animation (only ALL <-> Day, not Day <-> Day)
  const handleDayChange = useCallback((newDay: string) => {
    if (newDay === filters.activeDay || isAnimating) return
    
    // Day -> Day: No animation, instant switch
    if (filters.activeDay !== 'ALL' && newDay !== 'ALL') {
      setActiveDay(newDay as typeof filters.activeDay)
      return
    }
    
    setIsAnimating(true)
    
    if (newDay === 'ALL') {
      // Day -> ALL: Reverse of ALL -> Day
      setShowAllTimetable(true)
      setAllSlidePos(200)
      
      setTimeout(() => {
        setDaySlidePos(-155)
        setAllSlidePos(0)
      }, 20)
      
      setTimeout(() => {
        setActiveDay('ALL')
        setShowDayTimetable(false)
        setDaySlidePos(0)
        setIsAnimating(false)
      }, 620)
    } else {
      // ALL -> Day: Both animate simultaneously
      setShowDayTimetable(true)
      setDaySlidePos(-170)
      setActiveDay(newDay as typeof filters.activeDay)
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAllSlidePos(200)
          setDaySlidePos(0)
        })
      })
      
      setTimeout(() => {
        setShowAllTimetable(false)
        setAllSlidePos(0)
        setIsAnimating(false)
      }, 600)
    }
  }, [filters.activeDay, isAnimating, setActiveDay])

  // Group courses by time for detail panel
  const groupByTime = (courses: CSVCourse[]) => {
    const timeGroups: Map<string, CSVCourse[]> = new Map()
    courses.forEach(course => {
      const key = `${formatTime(course.startTime)} - ${formatTime(course.endTime)}`
      if (!timeGroups.has(key)) {
        timeGroups.set(key, [])
      }
      timeGroups.get(key)!.push(course)
    })
    return Array.from(timeGroups.entries()).sort((a, b) => {
      const [aStart] = a[0].split(' - ')
      const [bStart] = b[0].split(' - ')
      return aStart.localeCompare(bStart)
    })
  }

  // Convert Supabase groupedByDay to CSVCourse format for timetable
  const coursesByDay = useMemo((): Record<string, CourseGroup[]> => {
    const result: Record<string, CourseGroup[]> = {}
    
    Object.entries(groupedByDay).forEach(([day, groups]: [string, SupabaseCourseGroup[]]) => {
      result[day] = groups.map((group: SupabaseCourseGroup) => ({
        courses: group.items.map(item => ({
          courseCode: item.code,
          prefix: item.prefix,
          courseTitle: item.title,
          section: item.section,
          seatLimit: item.seatLimit ?? 0,
          seatUsed: item.seatUsed ?? 0,
          seatLeft: item.seatLeft ?? 0,
          startTime: item.start,
          endTime: item.end,
          day: item.day,
          instructor: item.instructor,
        } as CSVCourse)),
        startMin: group.min,
        endMin: group.max,
      }))
    })
    
    return result
  }, [groupedByDay])

  // Get all courses for search suggestions (after coursesByDay is declared)
  const allCourses = Object.values(coursesByDay).flatMap(groups => 
    groups.flatMap(g => g.courses)
  )

  // Process courses with layer assignments for vertical stacking (no overlap)
  const processedCoursesByDay = useMemo((): Record<string, DayCoursesResult> => {
    const result: Record<string, DayCoursesResult> = {}
    
    DAYS.forEach(day => {
      // Get all courses for this day from all groups
      const dayGroups = coursesByDay[day] || []
      const dayCourses = dayGroups.flatMap(g => g.courses)
      
      // Apply filters
      const filteredCourses = dayCourses.filter(c => {
        // Text search filter
        if (searchInput.trim()) {
          const matchesSearch = c.courseCode.toLowerCase().includes(searchInput.toLowerCase()) ||
            c.courseTitle.toLowerCase().includes(searchInput.toLowerCase())
          if (!matchesSearch) return false
        }
        // Advanced filters
        if (advancedFilters.prefix && c.prefix !== advancedFilters.prefix) return false
        if (advancedFilters.section && c.section !== advancedFilters.section) return false
        if (advancedFilters.instructor && c.instructor !== advancedFilters.instructor) return false
        if (advancedFilters.seatMin && c.seatLeft < parseInt(advancedFilters.seatMin)) return false
        if (advancedFilters.seatMax && c.seatLeft > parseInt(advancedFilters.seatMax)) return false
        if (advancedFilters.timeStart) {
          const filterStart = timeToMinutes(advancedFilters.timeStart)
          const courseStart = timeToMinutes(c.startTime)
          if (courseStart < filterStart) return false
        }
        if (advancedFilters.timeEnd) {
          const filterEnd = timeToMinutes(advancedFilters.timeEnd)
          const courseEnd = timeToMinutes(c.endTime)
          if (courseEnd > filterEnd) return false
        }
        return true
      })
      
      // Assign layers for overlap stacking
      result[day] = assignCourseLayers(filteredCourses)
    })
    
    return result
  }, [coursesByDay, searchInput, advancedFilters])

  // Get the latest course data for selected group (real-time updates)
  const selectedGroup = useMemo(() => {
    if (!selectedGroupIds) return null
    return selectedGroupIds
      .map(id => allCourses.find(c => c.courseCode === id.courseCode && c.section === id.section))
      .filter((c): c is CSVCourse => c !== undefined)
  }, [selectedGroupIds, allCourses])

  // Filter courses for search dropdown (smart search)
  const searchResults = searchInput.trim() 
    ? allCourses.filter(course => 
        course.courseCode.toLowerCase().includes(searchInput.toLowerCase()) ||
        course.courseTitle.toLowerCase().includes(searchInput.toLowerCase())
      ).slice(0, 8)
    : []

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Prevent body scroll when advanced filter modal is open
  useEffect(() => {
    if (showAdvancedFilter) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [showAdvancedFilter])

  // Get unique filter options based on current filters (dynamic dependency)
  const getFilteredCourses = () => {
    return allCourses.filter(course => {
      if (advancedFilters.prefix && course.prefix !== advancedFilters.prefix) return false
      if (advancedFilters.section && course.section !== advancedFilters.section) return false
      if (advancedFilters.instructor && course.instructor !== advancedFilters.instructor) return false
      if (advancedFilters.seatMin && course.seatLeft < parseInt(advancedFilters.seatMin)) return false
      if (advancedFilters.seatMax && course.seatLeft > parseInt(advancedFilters.seatMax)) return false
      if (advancedFilters.timeStart) {
        const filterStart = timeToMinutes(advancedFilters.timeStart)
        const courseStart = timeToMinutes(course.startTime)
        if (courseStart < filterStart) return false
      }
      if (advancedFilters.timeEnd) {
        const filterEnd = timeToMinutes(advancedFilters.timeEnd)
        const courseEnd = timeToMinutes(course.endTime)
        if (courseEnd > filterEnd) return false
      }
      return true
    })
  }

  // Get available options for each filter based on other selected filters
  const getAvailableOptions = () => {
    const filtered = getFilteredCourses()
    return {
      prefixes: [...new Set(allCourses.map(c => c.prefix))].filter(Boolean).sort(),
      sections: [...new Set(filtered.map(c => c.section))].filter(Boolean).sort(),
      instructors: [...new Set(filtered.map(c => c.instructor))].filter(Boolean).sort(),
      times: [...new Set(filtered.flatMap(c => [formatTime(c.startTime), formatTime(c.endTime)]))].filter(Boolean).sort(),
    }
  }

  const availableOptions = getAvailableOptions()

  // Apply advanced filters to search
  const applyAdvancedFilters = () => {
    setShowAdvancedFilter(false)
  }

  // Clear all advanced filters
  const clearAdvancedFilters = () => {
    setAdvancedFilters({
      prefix: '',
      seatMin: '',
      seatMax: '',
      timeStart: '',
      timeEnd: '',
      section: '',
      instructor: '',
    })
  }

  // Check if any advanced filter is active
  const hasActiveFilters = Object.values(advancedFilters).some(v => v !== '')

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    setSearch(value)
    setShowSearchDropdown(value.trim().length > 0)
  }

  // Handle search result click
  const handleSearchResultClick = (course: CSVCourse) => {
    setSearchInput(course.courseCode)
    setSearch(course.courseCode)
    setShowSearchDropdown(false)
  }

  // Get seat color for search results
  const getSeatColor = (seatLeft: number, seatLimit: number) => {
    if (seatLimit === 0) return 'bg-gray-400'
    const ratio = seatLeft / seatLimit
    if (ratio >= 0.5) return 'bg-emerald-500'
    if (ratio >= 0.25) return 'bg-amber-500'
    if (ratio > 0) return 'bg-orange-500'
    return 'bg-red-500'
  }

  // Get glow color based on seats
  const getGlowColor = (seatLeft: number, seatLimit: number) => {
    if (seatLimit === 0) return 'shadow-gray-400/50'
    const ratio = seatLeft / seatLimit
    if (ratio >= 0.5) return 'shadow-emerald-400/60'
    if (ratio >= 0.25) return 'shadow-amber-400/60'
    if (ratio > 0) return 'shadow-orange-400/60'
    return 'shadow-red-400/60'
  }

  // Handle glow for search results
  const handleSearchGlow = useCallback((courseId: string, direction: 'up' | 'down' | null) => {
    setGlowingCourses(prev => {
      const newSet = new Set(prev)
      if (direction) {
        newSet.add(courseId)
      } else {
        newSet.delete(courseId)
      }
      return newSet
    })
  }, [])

  // Handle delete course
  const handleDeleteCourse = async (courseCode: string, section: string) => {
    setIsDeleting(true)
    setDeleteMessage(null)
    
    try {
      // Use /api/planner endpoint for Course Planner (data_vme_planner table)
      const response = await fetch(`/api/planner?courseCode=${encodeURIComponent(courseCode)}&section=${encodeURIComponent(section)}&userId=${encodeURIComponent(user?.id || '')}`, {
        method: 'DELETE',
      })
      
      const result = await response.json()
      
      if (response.ok) {
        setDeleteMessage({ type: 'success', text: result.message })
        setDeleteConfirm(null)
        // Remove from selected group if it was the deleted course
        if (selectedGroupIds) {
          const remaining = selectedGroupIds.filter(
            id => !(id.courseCode === courseCode && id.section === section)
          )
          if (remaining.length === 0) {
            setSelectedGroupIds(null)
          } else {
            setSelectedGroupIds(remaining)
          }
        }
        // Refresh the course data
        setTimeout(() => {
          refresh()
          setDeleteMessage(null)
        }, 1500)
      } else {
        setDeleteMessage({ type: 'error', text: result.error || 'Failed to delete course' })
        setDeleteConfirm(null)
      }
    } catch {
      setDeleteMessage({ type: 'error', text: 'An unexpected error occurred' })
      setDeleteConfirm(null)
    } finally {
      setIsDeleting(false)
    }
  }

  // Handle glow for detail panel courses
  const handleDetailGlow = useCallback((courseId: string, direction: 'up' | 'down' | null) => {
    const detailId = `detail-${courseId}`
    
    // Clear existing timeout for this course
    const existingTimeout = glowTimeoutsRef.current.get(detailId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
      glowTimeoutsRef.current.delete(detailId)
    }
    
    setGlowingCourses(prev => {
      const newSet = new Set(prev)
      if (direction) {
        newSet.add(detailId)
        
        // Force clear after animation duration
        const timeout = setTimeout(() => {
          setGlowingCourses(prevSet => {
            const updatedSet = new Set(prevSet)
            updatedSet.delete(detailId)
            return updatedSet
          })
          glowTimeoutsRef.current.delete(detailId)
        }, 400)
        glowTimeoutsRef.current.set(detailId, timeout)
      } else {
        newSet.delete(detailId)
      }
      return newSet
    })
  }, [])

  // Cleanup all glow timeouts on unmount
  useEffect(() => {
    const timeoutsRef = glowTimeoutsRef.current
    return () => {
      timeoutsRef.forEach(timeout => clearTimeout(timeout))
      timeoutsRef.clear()
    }
  }, [])

  // Generate time ruler ticks
  const ticks = Array.from({ length: CELLS + 1 }, (_, i) => {
    const t = START_MIN + i * STEP_MIN
    const h = String(Math.floor(t / 60)).padStart(2, '0')
    const m = String(t % 60).padStart(2, '0')
    const x = ((t - START_MIN) / SPAN_MIN) * 100
    return { time: `${h}:${m}`, x, isLast: i === CELLS }
  })

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6">
      {/* Header with title and filters */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Course Planner</h1>
          <p className="text-sm text-gray-500">Admin tool for managing courses</p>
        </div>
      </div>

      <header className="flex justify-between items-center gap-3 mb-4 flex-wrap">
        {/* Day tabs */}
        <nav className="flex gap-1 border border-red-600 rounded-xl p-1 bg-white">
          <button
            onClick={() => handleDayChange('ALL')}
            className={cn(
              'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              filters.activeDay === 'ALL'
                ? 'bg-red-600 text-white'
                : 'text-red-600 hover:bg-red-50'
            )}
          >
            ALL
          </button>
          {DAYS.map(day => (
            <button
              key={day}
              onClick={() => handleDayChange(day)}
              className={cn(
                'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                filters.activeDay === day
                  ? 'bg-red-600 text-white'
                  : 'text-red-600 hover:bg-red-50'
              )}
            >
              {day.slice(0, 1)}
            </button>
          ))}
        </nav>

        {/* Tools */}
        <div className="flex gap-2 items-center">
          {/* Add New Class Button */}
          <button
            onClick={() => setShowAddClassModal(true)}
            className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add New Class
          </button>
          
          {/* Search with dropdown and filter icon */}
          <div className="relative" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
            <input
              type="text"
              placeholder="Search course code..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => searchInput.trim() && setShowSearchDropdown(true)}
              className="pl-9 pr-10 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500 w-[300px]"
            />
            {/* Filter icon at end of search input */}
            <button
              onClick={() => setShowAdvancedFilter(!showAdvancedFilter)}
              className={cn(
                "absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10 transition-colors",
                hasActiveFilters ? "text-red-500" : "text-gray-400 hover:text-gray-600"
              )}
              title="Advanced Filters"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            {/* Search dropdown results */}
            {showSearchDropdown && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                {searchResults.map((course) => {
                  const courseId = `${course.courseCode}-${course.section}`
                  const isGlowing = glowingCourses.has(courseId)
                  return (
                    <button
                      key={courseId}
                      onClick={() => handleSearchResultClick(course)}
                      className={cn(
                        "w-full px-3 py-2 flex items-center justify-between transition-colors border-b border-gray-100 last:border-b-0",
                        "hover:bg-gray-50",
                        isGlowing && getGlowColor(course.seatLeft, course.seatLimit)
                      )}
                    >
                      <div className="flex flex-col items-start">
                        <span className="font-semibold text-gray-800 text-sm">{course.courseCode}</span>
                        <span className="text-xs text-gray-500 truncate max-w-[150px]">{course.courseTitle}</span>
                      </div>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-bold text-white inline-flex items-center",
                        getSeatColor(course.seatLeft, course.seatLimit)
                      )}>
                        <AnimatedNumber value={course.seatLeft} onChangeDirection={(dir) => handleSearchGlow(courseId, dir)} /><span>/{course.seatLimit}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {/* No results message */}
            {showSearchDropdown && searchInput.trim() && searchResults.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3 text-center text-gray-500 text-sm animate-in fade-in slide-in-from-top-2 duration-200">
                No courses found
              </div>
            )}
          </div>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="px-3 py-2 border border-red-600 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
        </div>
      </header>

      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="w-12 h-12 text-red-600 animate-spin" />
            <p className="text-lg font-medium text-gray-700">
              Loading Course Planner...
            </p>
          </div>
        </div>
      )}

      {/* Timetable container - relative for absolute positioned children */}
      <div className="relative">
        {/* Swimlane View for individual days - slides like toilet paper roll */}
        {showDayTimetable && (
          <div 
            className={cn(
              "transition-transform duration-[600ms]",
              showAllTimetable && "absolute inset-x-0 top-0"
            )}
            style={{
              transform: `translateX(${daySlidePos}%)`,
              transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <SwimlaneSchedule day={filters.activeDay as 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'} courses={allCourses} />
          </div>
        )}

        {/* Regular Timetable View - ALL days - slides like toilet paper roll */}
        {showAllTimetable && (
          <div 
            className={cn(
              "transition-transform duration-[600ms]",
              showDayTimetable && "absolute inset-x-0 top-0"
            )}
            style={{
              transform: `translateX(${allSlidePos}%)`,
              transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
        <div className="relative">

        {/* Timetable content - wider to the right for more course name space */}
        <div style={{ width: '120%' }}>
          {/* Time ruler - outside the box */}
          <div className="relative ml-[70px] h-5 mb-2">
            {ticks.map((tick, i) => (
              <div
                key={i}
                className="absolute top-0 -translate-x-1/2 text-xs text-gray-500 font-semibold"
                style={{ left: `${tick.x}%` }}
              >
                {!tick.isLast && tick.time}
                <div className="w-px h-3 bg-gray-200 mx-auto mt-1" />
              </div>
            ))}
          </div>

          {/* Time table box */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-md">
            {/* Grid - Time table structure with vertical stacking for overlaps */}
            <div>
              {DAYS.map((day, dayIdx) => {
                const dayData = processedCoursesByDay[day] || { courses: [], maxLayers: 0 }
                const { courses: dayCourses, maxLayers } = dayData
                const rowHeight = Math.max(1, maxLayers) * 52 // 52px per layer, minimum 52px
                
                return (
                  <div
                    key={day}
                    className={cn(
                      'relative',
                      dayIdx > 0 && 'border-t border-gray-200'
                    )}
                    style={{ minHeight: `${rowHeight}px` }}
                  >
                    {/* Day label - sticky left */}
                    <div 
                      className="absolute left-0 top-0 bottom-0 w-[70px] flex items-center justify-center font-semibold text-gray-500 bg-white border-r border-gray-200 z-10"
                      style={{ position: 'sticky', left: 0 }}
                    >
                      {day.slice(0, 3).toUpperCase()}
                    </div>

                    {/* Time slots grid with CSS Grid for vertical stacking */}
                    <div 
                      className="ml-[70px] relative"
                      style={{
                        display: 'grid',
                        gridTemplateRows: `repeat(${Math.max(1, maxLayers)}, minmax(56px, auto))`,
                        gridTemplateColumns: `repeat(${CELLS}, 1fr)`,
                        backgroundImage: 'linear-gradient(to right, #e5e7eb 1px, transparent 1px)',
                        backgroundSize: `${100 / CELLS}% 100%`,
                        minHeight: `${rowHeight}px`,
                      }}
                    >
                      {/* Course cards - positioned by absolute positioning for precise time alignment */}
                      {dayCourses.map((course) => {
                        const courseId = `${course.courseCode}-${course.section}`
                        const courseStart = timeToMinutes(course.startTime)
                        const courseEnd = timeToMinutes(course.endTime)
                        
                        // Calculate precise position using percentage of total span
                        const leftPercent = ((courseStart - START_MIN) / SPAN_MIN) * 100
                        const widthPercent = ((courseEnd - courseStart) / SPAN_MIN) * 100
                        
                        // Seat status color
                        const seatRatio = course.seatLimit > 0 ? course.seatLeft / course.seatLimit : 0
                        const statusColor = course.seatLeft === 0 ? 'bg-red-100 border-red-300 hover:bg-red-50' :
                          seatRatio < 0.25 ? 'bg-orange-100 border-orange-300 hover:bg-orange-50' :
                          seatRatio < 0.5 ? 'bg-amber-100 border-amber-300 hover:bg-amber-50' :
                          'bg-emerald-100 border-emerald-300 hover:bg-emerald-50'
                        
                        const badgeColor = course.seatLeft === 0 ? 'bg-red-500' :
                          seatRatio < 0.25 ? 'bg-orange-500' :
                          seatRatio < 0.5 ? 'bg-amber-500' :
                          'bg-emerald-500'
                        
                        return (
                          <div
                            key={courseId}
                            className={cn(
                              "absolute px-2 py-1.5 rounded-lg border-2 cursor-pointer transition-all duration-200",
                              "hover:shadow-md hover:scale-[1.02] hover:z-20",
                              statusColor
                            )}
                            style={{
                              left: `${leftPercent}%`,
                              width: `${widthPercent}%`,
                              top: `${course.layer * 52}px`, // 52px per layer
                              height: '48px', // Reduced height for compact display
                              zIndex: 10 + course.layer, // Higher layers on top
                            }}
                            onClick={() => handleCourseClick([course])}
                          >
                            {/* Course content */}
                            <div className="flex flex-col h-full justify-between">
                              <div className="flex items-center justify-between">
                                <div className="font-bold text-gray-800 text-sm">
                                  {course.courseCode}
                                </div>
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded text-xs font-bold text-white shrink-0",
                                  badgeColor
                                )}>
                                  {course.seatLeft}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500">
                                {formatTime(course.startTime)} – {formatTime(course.endTime)}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      
                      {/* Empty state */}
                      {dayCourses.length === 0 && (
                        <div 
                          className="absolute flex items-center justify-center text-gray-400 text-sm italic"
                          style={{
                            left: '50%',
                            top: '24px',
                            transform: 'translateX(-50%)',
                            width: 'auto',
                            height: '48px',
                          }}
                        >
                          No courses
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        </div>
      </div>
      )}
      </div>

      {/* Advanced Filter Popup - Rendered via Portal to escape transform context */}
      <Portal>
        {showAdvancedFilter && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center">
            {/* Backdrop with fade animation */}
            <div 
              className="absolute inset-0 bg-black/30 animate-in fade-in duration-200 backdrop-blur-sm"
              onClick={() => setShowAdvancedFilter(false)}
            />
            {/* Modal with scale + fade animation */}
            <div 
              ref={filterRef}
              className="relative w-[420px] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h3 className="font-semibold text-gray-800 text-sm">Advanced Filters</h3>
                <button onClick={() => setShowAdvancedFilter(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              {/* Filter fields */}
              <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* Prefix */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Prefix</label>
                  <select
                    value={advancedFilters.prefix}
                    onChange={(e) => setAdvancedFilters(prev => ({ ...prev, prefix: e.target.value, section: '', instructor: '' }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">All Prefixes</option>
                    {availableOptions.prefixes.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Seat Range */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Seats Available</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      placeholder="Min"
                      value={advancedFilters.seatMin}
                      onChange={(e) => setAdvancedFilters(prev => ({ ...prev, seatMin: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                      min="0"
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={advancedFilters.seatMax}
                      onChange={(e) => setAdvancedFilters(prev => ({ ...prev, seatMax: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                      min="0"
                    />
                  </div>
                </div>

                {/* Time Range */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Time Range</label>
                  <div className="flex gap-2 items-center">
                    <select
                      value={advancedFilters.timeStart}
                      onChange={(e) => setAdvancedFilters(prev => ({ ...prev, timeStart: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="">Start</option>
                      {availableOptions.times.map(t => (
                        <option key={`start-${t}`} value={t}>{t}</option>
                      ))}
                    </select>
                    <span className="text-gray-400">-</span>
                    <select
                      value={advancedFilters.timeEnd}
                      onChange={(e) => setAdvancedFilters(prev => ({ ...prev, timeEnd: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="">End</option>
                      {availableOptions.times.map(t => (
                        <option key={`end-${t}`} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Section */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Section</label>
                  <select
                    value={advancedFilters.section}
                    onChange={(e) => setAdvancedFilters(prev => ({ ...prev, section: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">All Sections</option>
                    {availableOptions.sections.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Instructor */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Instructor</label>
                  <select
                    value={advancedFilters.instructor}
                    onChange={(e) => setAdvancedFilters(prev => ({ ...prev, instructor: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="">All Instructors</option>
                    {availableOptions.instructors.map(i => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Footer buttons */}
              <div className="flex gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
                <button
                  onClick={clearAdvancedFilters}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Clear All
                </button>
                <button
                  onClick={applyAdvancedFilters}
                  className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </Portal>
      
      {/* Add Class Modal */}
      <AddClassModalPlanner
        isOpen={showAddClassModal}
        onClose={() => setShowAddClassModal(false)}
        onSuccess={() => {
          setShowAddClassModal(false)
          refresh()
        }}
      />

      {/* Edit Class Modal */}
      <EditClassModalPlanner
        isOpen={showEditClassModal}
        onClose={() => {
          setShowEditClassModal(false)
          setEditingCourse(null)
        }}
        onSuccess={() => {
          setShowEditClassModal(false)
          setEditingCourse(null)
          refresh()
        }}
        course={editingCourse}
        userId={user?.id}
      />

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-[200] animate-in fade-in duration-200"
            onClick={() => !isDeleting && setDeleteConfirm(null)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] bg-white rounded-xl shadow-2xl z-[201] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Delete Course</h3>
              </div>
              <p className="text-gray-600 mb-2">
                Are you sure you want to delete this course?
              </p>
              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                <p className="font-semibold text-gray-800">{deleteConfirm.courseCode}</p>
                <p className="text-sm text-gray-500">Section: {deleteConfirm.section}</p>
              </div>
              <p className="text-sm text-red-600 mb-4">
                This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteCourse(deleteConfirm.courseCode, deleteConfirm.section)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Course Detail Panel - Left side positioned, no backdrop blur */}
      <Portal>
        {selectedGroup && (
          <div 
            className="fixed top-[55px] left-0 h-[calc(100%-55px)] bg-white border border-gray-200 rounded-r-2xl shadow-lg z-40 overflow-hidden animate-in slide-in-from-left duration-300 "
            style={{ width: '400px' }}
          > 
              <CourseDetailEditor
                selectedGroup={selectedGroup!}
                onClose={closeDetailPanel}
                onEdit={(course) => {
                  setEditingCourse({
                    courseCode: course.courseCode,
                    section: course.section,
                    prefix: course.prefix,
                    courseTitle: course.courseTitle,
                    seatLimit: course.seatLimit,
                    seatUsed: course.seatUsed,
                    seatLeft: course.seatLeft,
                    startTime: course.startTime,
                    endTime: course.endTime,
                    instructorName: course.instructor,
                    day: course.day,
                  })
                  setShowEditClassModal(true)
                }}
                onDelete={(courseCode, section) => {
                  setDeleteConfirm({ courseCode, section })
                }}
                glowingCourses={glowingCourses}
                onDetailGlow={handleDetailGlow}
                GLOW_SIZE={GLOW_SIZE}
                getGlowColor={getGlowColor}
                formatTime={formatTime}
              />
            </div>
        )}
      </Portal>

      {/* Delete Message Toast */}
      {deleteMessage && (
        <div className={cn(
          "fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-[202] animate-in slide-in-from-bottom-4 duration-300 flex items-center gap-2",
          deleteMessage.type === 'success' ? "bg-green-600 text-white" : "bg-red-600 text-white"
        )}>
          {deleteMessage.type === 'success' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {deleteMessage.text}
        </div>
      )}
    </div>
  )
}
