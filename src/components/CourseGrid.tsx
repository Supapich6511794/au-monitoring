'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useCourses, DatabaseMode } from '@/hooks/useCourses'
import { DAYS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react'
import { CourseBlock, CSVCourse } from './CourseBlock'
import { CourseGroup as SupabaseCourseGroup } from '@/lib/types'

import { AnimatedNumber } from './AnimatedNumber'
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

// Group overlapping courses (courses that overlap in ANY way, not just same time)
interface CourseGroup {
  courses: CSVCourse[]
  startMin: number
  endMin: number
}

function groupOverlappingCourses(courses: CSVCourse[]): CourseGroup[] {
  if (courses.length === 0) return []
  
  // Sort by start time
  const sorted = [...courses].sort((a, b) => 
    timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  )
  
  const groups: CourseGroup[] = []
  let currentGroup: CourseGroup = {
    courses: [sorted[0]],
    startMin: timeToMinutes(sorted[0].startTime),
    endMin: timeToMinutes(sorted[0].endTime)
  }
  
  for (let i = 1; i < sorted.length; i++) {
    const course = sorted[i]
    const courseStart = timeToMinutes(course.startTime)
    const courseEnd = timeToMinutes(course.endTime)
    
    // Check if this course overlaps with current group
    if (courseStart < currentGroup.endMin) {
      // Overlaps - add to current group and extend end time if needed
      currentGroup.courses.push(course)
      currentGroup.endMin = Math.max(currentGroup.endMin, courseEnd)
    } else {
      // No overlap - save current group and start new one
      groups.push(currentGroup)
      currentGroup = {
        courses: [course],
        startMin: courseStart,
        endMin: courseEnd
      }
    }
  }
  
  // Don't forget the last group
  groups.push(currentGroup)
  
  return groups
}

// Course with layer assignment for single-day grid view
interface CourseWithLayer extends CSVCourse {
  layer: number
}

// Assign vertical layers to courses for a single day (handles overlaps)
function assignCourseLayers(courses: CSVCourse[]): { courses: CourseWithLayer[]; maxLayers: number } {
  if (courses.length === 0) return { courses: [], maxLayers: 0 }

  const sorted = [...courses].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
  const layerEnds: number[] = [] // Track end time per layer

  const result: CourseWithLayer[] = sorted.map(course => {
    const start = timeToMinutes(course.startTime)
    let layer = layerEnds.findIndex(end => end <= start)
    if (layer === -1) {
      layer = layerEnds.length
      layerEnds.push(0)
    }
    layerEnds[layer] = timeToMinutes(course.endTime)
    return { ...course, layer }
  })

  return { courses: result, maxLayers: layerEnds.length }
}

// Centralized glow configuration - Change this number to adjust all glow sizes
const GLOW_SIZE = 'md' // Options: 'sm', '', 'md', 'lg', 'xl', '2xl'

// Get glow color based on seats (same as CourseBlock)
function getDayGlowColor(seatLeft: number, seatLimit: number): string {
  if (seatLimit === 0) return 'shadow-gray-400/50'
  const ratio = seatLeft / seatLimit
  if (ratio >= 0.5) return 'shadow-emerald-400/60'
  if (ratio >= 0.25) return 'shadow-amber-400/60'
  if (ratio > 0) return 'shadow-orange-400/60'
  return 'shadow-red-400/60'
}

// Day view course card with glow on seat change (same logic as CourseBlock)
function DayCourseCard({
  course,
  leftPercent,
  widthPercent,
  statusColor,
  badgeColor,
  onClick,
}: {
  course: CourseWithLayer
  leftPercent: number
  widthPercent: number
  statusColor: string
  badgeColor: string
  onClick: () => void
}) {
  const [isGlowing, setIsGlowing] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleSeatChange = useCallback((direction: 'up' | 'down' | null) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (direction) {
      setIsGlowing(true)
      timeoutRef.current = setTimeout(() => setIsGlowing(false), 400)
    } else {
      setIsGlowing(false)
    }
  }, [])

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [])

  return (
    <div
      className={cn(
        "absolute px-2 py-1.5 rounded-lg border-2 cursor-pointer transition-all duration-200",
        "hover:shadow-md hover:scale-[1.02] hover:z-20",
        statusColor,
        isGlowing && `shadow-${GLOW_SIZE}`,
        isGlowing && getDayGlowColor(course.seatLeft, course.seatLimit)
      )}
      style={{
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        top: `${course.layer * 52}px`,
        height: '48px',
        zIndex: isGlowing ? 100 : 10 + course.layer,
      }}
      onClick={onClick}
    >
      <div className="flex flex-col h-full justify-between">
        <div className="flex items-center justify-between">
          <div className="font-bold text-gray-800 text-sm truncate">
            {course.courseCode}
          </div>
          <span className={cn(
            "px-1.5 py-0.5 rounded text-xs font-bold text-white shrink-0",
            badgeColor
          )}>
            <AnimatedNumber value={course.seatLeft} onChangeDirection={handleSeatChange} />
          </span>
        </div>
        <div className="text-[10px] text-gray-500 truncate leading-tight">
          {formatTime(course.startTime)} - {formatTime(course.endTime)}
        </div>
      </div>
    </div>
  )
}

export function CourseGrid() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [glowingCourses, setGlowingCourses] = useState<Set<string>>(new Set())
  const glowTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  
  // Track URL params to detect changes
  const urlCourse = searchParams.get('search')
  const urlDb = searchParams.get('db')
  const urlSection = searchParams.get('section')
  const urlAutoOpen = searchParams.get('autoOpen')
  
  // FIX: Initialize database mode from URL BEFORE calling useCourses
  // This ensures we fetch from the correct table from the start
  const initialDbMode = useMemo(() => {
    return (urlDb === 'test' ? 'test' : 'default') as DatabaseMode
  }, []) // Empty deps - only compute once on mount
  
  // Track if user manually changed database (to prevent URL override)
  const [userChangedDB, setUserChangedDB] = useState(false)
  
  const {
    groupedByDay,
    isLoading,
    filters,
    setSearch,
    setActiveDay,
    refresh,
    databaseMode,
    setDatabaseMode,
    isSimulatorRunning,
  } = useCourses(initialDbMode)

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
  const POPUP_WIDTH = 500

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
      setActiveDay(newDay as any)
      return
    }
    
    setIsAnimating(true)
    
    if (newDay === 'ALL') {
      // Day -> ALL: Reverse of ALL -> Day
      // Day slides out LEFT (-100%), ALL slides in from RIGHT (200% -> 0%)
      
      // Keep Day visible and at center, show ALL off-screen right
      // DON'T change activeDay yet - Day timetable needs current day to render
      setShowAllTimetable(true)
      setAllSlidePos(200) // Start ALL off-screen RIGHT
      
      // Animate both at the same time
      setTimeout(() => {
        setDaySlidePos(-155) // Day slides out LEFT
        setAllSlidePos(0) // ALL slides to center
      }, 20)
      
      // After animation complete, cleanup and change day
      setTimeout(() => {
        setActiveDay('ALL') // Change day AFTER animation
        setShowDayTimetable(false)
        setDaySlidePos(0) // Reset for next time
        setIsAnimating(false)
      }, 620)
    } else {
      // ALL -> Day: Both animate simultaneously
      // ALL slides out RIGHT (200%), Day slides in from LEFT (-100% -> 0%)
      setShowDayTimetable(true)
      setDaySlidePos(-170) // Start day off-screen LEFT
      setActiveDay(newDay as any)
      
      // Animate both at the same time
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAllSlidePos(200) // ALL slides out RIGHT
          setDaySlidePos(0) // Day slides to center
        })
      })
      
      // After animation complete, cleanup
      setTimeout(() => {
        setShowAllTimetable(false)
        setAllSlidePos(0) // Reset for next time
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
    // Sort by start time
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
  
  // Debug logging for database mode and data
  useEffect(() => {
    console.log('[CourseGrid] Database mode:', databaseMode)
    console.log('[CourseGrid] Total courses loaded:', allCourses.length)
    console.log('[CourseGrid] URL params:', { urlCourse, urlSection, urlDb, urlAutoOpen })
  }, [databaseMode, allCourses.length, urlCourse, urlSection, urlDb, urlAutoOpen])

  // FIX BUG 2: Filter coursesByDay to show ONLY the specific section from URL
  const filteredCoursesByDay = useMemo((): Record<string, CourseGroup[]> => {
    // If no URL params, show all courses
    if (!urlCourse || !urlSection) {
      return coursesByDay
    }
    
    console.log('[filteredCoursesByDay] Filtering for:', urlCourse, 'section:', urlSection)
    console.log('[filteredCoursesByDay] Available courses in coursesByDay:', 
      Object.values(coursesByDay).flatMap(groups => 
        groups.flatMap(g => g.courses.map(c => `${c.courseCode}-${c.section} (seats: ${c.seatLeft})`))
      )
    )
    
    // Filter to show ONLY the specific course + section
    const result: Record<string, CourseGroup[]> = {}
    
    Object.entries(coursesByDay).forEach(([day, groups]) => {
      const filteredGroups = groups
        .map(group => {
          const filteredCourses = group.courses.filter(c => {
            const codeMatch = c.courseCode.toLowerCase() === urlCourse.toLowerCase()
            const sectionMatch = c.section === urlSection
            
            if (codeMatch && sectionMatch) {
              console.log('[filteredCoursesByDay] ✅ Found match:', c.courseCode, c.section, 'seats:', c.seatLeft)
            }
            
            return codeMatch && sectionMatch
          })
          
          // Recalculate group time range to match filtered courses only
          if (filteredCourses.length > 0) {
            const courseTimes = filteredCourses.map(c => ({
              start: timeToMinutes(c.startTime),
              end: timeToMinutes(c.endTime)
            }))
            const newStartMin = Math.min(...courseTimes.map(t => t.start))
            const newEndMin = Math.max(...courseTimes.map(t => t.end))
            
            return {
              ...group,
              courses: filteredCourses,
              startMin: newStartMin,
              endMin: newEndMin
            }
          }
          
          return { ...group, courses: filteredCourses }
        })
        .filter(group => group.courses.length > 0) // Remove empty groups
      
      if (filteredGroups.length > 0) {
        result[day] = filteredGroups
      }
    })
    
    console.log('[filteredCoursesByDay] Filtered result days:', Object.keys(result))
    return result
  }, [coursesByDay, urlCourse, urlSection])

  // Processed courses for single-day planner-style grid view
  const processedDayCourses = useMemo(() => {
    if (filters.activeDay === 'ALL') return { courses: [] as CourseWithLayer[], maxLayers: 0 }
    const dayCourses = allCourses.filter(c => c.day === filters.activeDay)
    // Apply search + advanced filters
    const filtered = dayCourses.filter(c => {
      if (searchInput.trim()) {
        const matchesSearch = c.courseCode.toLowerCase().includes(searchInput.toLowerCase()) ||
          c.courseTitle.toLowerCase().includes(searchInput.toLowerCase())
        if (!matchesSearch) return false
      }
      if (advancedFilters.prefix && c.prefix !== advancedFilters.prefix) return false
      if (advancedFilters.section && c.section !== advancedFilters.section) return false
      if (advancedFilters.instructor && c.instructor !== advancedFilters.instructor) return false
      if (advancedFilters.seatMin && c.seatLeft < parseInt(advancedFilters.seatMin)) return false
      if (advancedFilters.seatMax && c.seatLeft > parseInt(advancedFilters.seatMax)) return false
      if (advancedFilters.timeStart) {
        if (timeToMinutes(c.startTime) < timeToMinutes(advancedFilters.timeStart)) return false
      }
      if (advancedFilters.timeEnd) {
        if (timeToMinutes(c.endTime) > timeToMinutes(advancedFilters.timeEnd)) return false
      }
      return true
    })
    return assignCourseLayers(filtered)
  }, [filters.activeDay, allCourses, searchInput, advancedFilters])

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
      ).slice(0, 8) // Limit to 8 results
    : []

  // Track previous URL params to detect actual changes
  const prevUrlParamsRef = useRef({ course: urlCourse, section: urlSection, autoOpen: urlAutoOpen })
  
  // FIX BUG 1 & 2: Process URL parameters reactively (no caching)
  useEffect(() => {
    // Skip if still loading data
    if (isLoading) return
    
    // Check if URL params actually changed
    const urlParamsChanged = 
      prevUrlParamsRef.current.course !== urlCourse ||
      prevUrlParamsRef.current.section !== urlSection ||
      prevUrlParamsRef.current.autoOpen !== urlAutoOpen
    
    // Only process if URL params changed
    if (!urlParamsChanged) return
    
    // Update ref
    prevUrlParamsRef.current = { course: urlCourse, section: urlSection, autoOpen: urlAutoOpen }
    
    // Reset state when URL params are cleared (e.g., after database switch)
    if (!urlCourse && !urlAutoOpen) {
      console.log('[CourseGrid] URL params cleared - resetting filters')
      // Clear search filters
      if (searchInput) {
        setSearchInput('')
        setSearch('')
      }
      // Only clear detail panel if it was opened via URL
      // Don't clear if user manually clicked a course
      return
    }
    
    // Apply search filter from URL - only if different from current value
    if (urlCourse && searchInput !== urlCourse) {
      console.log('[CourseGrid] Setting search from URL:', urlCourse)
      setSearchInput(urlCourse)
      setSearch(urlCourse)
    }
    
    // Auto-open detail panel with ONLY the specific section
    if (urlAutoOpen === 'true' && urlCourse && !isLoading) {
      console.log('[CourseGrid] Auto-opening detail panel for:', urlCourse, 'section:', urlSection)
      
      // Filter to show the specific section (regardless of seat status)
      const matchingCourses = allCourses.filter(c => {
        const codeMatch = c.courseCode.toLowerCase() === urlCourse.toLowerCase()
        const sectionMatch = urlSection ? c.section === urlSection : true
        
        return codeMatch && sectionMatch
      })
      
      console.log('[CourseGrid] Found matching courses:', matchingCourses.length)
      
      if (matchingCourses.length > 0) {
        // Clear previous selection first (FIX BUG 1: prevent stale data)
        setSelectedGroupIds(null)
        
        // Set new selection after a brief delay
        setTimeout(() => {
          setSelectedGroupIds(matchingCourses.map(c => ({ 
            courseCode: c.courseCode, 
            section: c.section 
          })))
        }, 50)
      } else {
        console.warn('[CourseGrid] No matching sections found for:', urlCourse, urlSection)
        setSelectedGroupIds(null)
      }
    }
  }, [urlCourse, urlSection, urlAutoOpen, isLoading, allCourses, searchInput])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false)
      }
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowAdvancedFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  // Compute analytics data by prefix
  const analyticsData = useMemo(() => {
    const prefixStats: Record<string, { total: number; full: number; almostFull: number; available: number; totalSeats: number; usedSeats: number }> = {}
    
    allCourses.forEach(course => {
      const prefix = course.prefix || 'OTHER'
      if (!prefixStats[prefix]) {
        prefixStats[prefix] = { total: 0, full: 0, almostFull: 0, available: 0, totalSeats: 0, usedSeats: 0 }
      }
      
      prefixStats[prefix].total++
      prefixStats[prefix].totalSeats += course.seatLimit
      prefixStats[prefix].usedSeats += course.seatUsed
      
      const ratio = course.seatLimit > 0 ? course.seatLeft / course.seatLimit : 0
      if (course.seatLeft === 0) {
        prefixStats[prefix].full++
      } else if (ratio < 0.25) {
        prefixStats[prefix].almostFull++
      } else {
        prefixStats[prefix].available++
      }
    })
    
    // Sort by total courses descending
    const sorted = Object.entries(prefixStats)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8) // Top 8 prefixes
    
    // Overall stats
    const overall = {
      totalCourses: allCourses.length,
      fullCourses: allCourses.filter(c => c.seatLeft === 0).length,
      almostFullCourses: allCourses.filter(c => c.seatLeft > 0 && c.seatLimit > 0 && c.seatLeft / c.seatLimit < 0.25).length,
      availableCourses: allCourses.filter(c => c.seatLimit > 0 && c.seatLeft / c.seatLimit >= 0.25).length,
      totalSeats: allCourses.reduce((sum, c) => sum + c.seatLimit, 0),
      usedSeats: allCourses.reduce((sum, c) => sum + c.seatUsed, 0),
    }
    
    return { prefixStats: sorted, overall }
  }, [allCourses])

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
        console.log('CourseGrid handleDetailGlow: adding glow', detailId)
        newSet.add(detailId)
        
        // Force clear after animation duration
        const timeout = setTimeout(() => {
          console.log('CourseGrid timeout clearing glow', detailId)
          setGlowingCourses(prevSet => {
            const updatedSet = new Set(prevSet)
            updatedSet.delete(detailId)
            return updatedSet
          })
          glowTimeoutsRef.current.delete(detailId)
        }, 400)
        glowTimeoutsRef.current.set(detailId, timeout)
      } else {
        console.log('CourseGrid handleDetailGlow: removing glow', detailId)
        newSet.delete(detailId)
      }
      return newSet
    })
  }, [])

  // Cleanup all glow timeouts on unmount
  useEffect(() => {
    return () => {
      glowTimeoutsRef.current.forEach(timeout => clearTimeout(timeout))
      glowTimeoutsRef.current.clear()
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
    <div className="max-w-[1000px] mx-auto px-4 py-6">
      {/* Header with filters */}
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
          {/* Search with dropdown and filter icon */}
          <div className="relative" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
            <input
              type="text"
              placeholder="Search course code..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => searchInput.trim() && setShowSearchDropdown(true)}
              className="pl-9 pr-10 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500 w-[400px]"
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
                {searchResults.map((course, idx) => {
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
          <select
            value={databaseMode}
            onChange={(e) => {
              const newDb = e.target.value as DatabaseMode
              console.log('[CourseGrid] User manually changed database to:', newDb)
              
              // Mark that user manually changed database - prevents URL override
              setUserChangedDB(true)
              setDatabaseMode(newDb)
              
              // CRITICAL FIX: Clear URL params and filters when switching databases
              // This prevents "Course Section Not Found" errors
              router.push('/course-monitoring', { scroll: false })
              
              // Clear local search state
              setSearchInput('')
              setSearch('')
              
              // Close detail panel
              setSelectedGroupIds(null)
              
              console.log('[CourseGrid] Cleared filters - showing full timetable')
            }}
            className={cn(
              "px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 font-medium",
              databaseMode === 'test' 
                ? "border-orange-400 bg-orange-50 text-orange-700" 
                : "border-gray-200 bg-white text-gray-700"
            )}
          >
            <option value="default">Database: Default</option>
            <option value="test">Database: Test {isSimulatorRunning ? '🟢' : ''}</option>
          </select>
                    <button
            onClick={refresh}
            disabled={isLoading}
            className="px-3 py-2 border border-red-600 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
        </div>
      </header>

      {/* Loading overlay when switching databases */}
      {isLoading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="w-12 h-12 text-red-600 animate-spin" />
            <p className="text-lg font-medium text-gray-700">
              Loading {databaseMode === 'test' ? 'Test' : 'Default'} Database...
            </p>
          </div>
        </div>
      )}

      {/* Timetable container - relative for absolute positioned children */}
      <div className="relative">
        {/* Planner-style single-day grid for individual days */}
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
            {(() => {
              const { courses: dayCourses, maxLayers } = processedDayCourses
              const rowHeight = Math.max(3, maxLayers) * 52
              const dayName = filters.activeDay !== 'ALL' ? filters.activeDay : ''

              return (
                <div className="relative">
                  {/* Timetable content */}
                  <div style={{ width: '120%' }}>
                    {/* Time ruler */}
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
                      <div
                        className="relative"
                        style={{ minHeight: `${rowHeight}px` }}
                      >
                        {/* Day label */}
                        <div className="absolute left-0 top-0 bottom-0 w-[70px] flex items-center justify-center font-semibold text-gray-500 bg-white border-r border-gray-200 z-10">
                          {dayName.slice(0, 3).toUpperCase()}
                        </div>

                        {/* Time slots grid */}
                        <div
                          className="ml-[70px] relative"
                          style={{
                            display: 'grid',
                            gridTemplateRows: `repeat(${Math.max(3, maxLayers)}, minmax(56px, auto))`,
                            gridTemplateColumns: `repeat(${CELLS}, 1fr)`,
                            backgroundImage: 'linear-gradient(to right, #e5e7eb 1px, transparent 1px)',
                            backgroundSize: `${100 / CELLS}% 100%`,
                            minHeight: `${rowHeight}px`,
                          }}
                        >
                          {/* Course cards */}
                          {dayCourses.map((course) => {
                            const courseId = `${course.courseCode}-${course.section}`
                            const courseStart = timeToMinutes(course.startTime)
                            const courseEnd = timeToMinutes(course.endTime)
                            const leftPercent = ((courseStart - START_MIN) / SPAN_MIN) * 100
                            const widthPercent = ((courseEnd - courseStart) / SPAN_MIN) * 100

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
                              <DayCourseCard
                                key={courseId}
                                course={course}
                                leftPercent={leftPercent}
                                widthPercent={widthPercent}
                                statusColor={statusColor}
                                badgeColor={badgeColor}
                                onClick={() => handleCourseClick([course])}
                              />
                            )
                          })}

                          {/* Empty state */}
                          {dayCourses.length === 0 && (
                            <div
                              className="absolute flex items-center justify-center text-gray-400 text-sm italic"
                              style={{
                                left: '50%',
                                top: '50%',
                                transform: 'translate(-50%, -50%)',
                              }}
                            >
                              No courses on {dayName}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
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
        <div 
          className="relative transition-all duration-500 ease-in-out"
          style={{
            transform: selectedGroup ? 'translateX(20%)' : 'translateX(0)',
          }}
        >
        {/* Detail Panel - ABSOLUTE positioned, pops out from timetable left edge */}
        <div 
          className={cn(
            "absolute top-0 bg-white border border-gray-200 rounded-l-2xl shadow-lg z-30 transition-all duration-500 ease-in-out overflow-hidden",
            selectedGroup ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          style={{
            right: '100%',
            marginRight: '16px',
            width: selectedGroup ? `${POPUP_WIDTH}px` : '0px',
          }}
        >
          {selectedGroup && (
            <div className="flex flex-col" style={{ width: `${POPUP_WIDTH}px`, maxHeight: '530px' }}>
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="font-bold text-gray-800">Course Details</h3>
                <button 
                  onClick={closeDetailPanel}
                  className="text-gray-500 hover:text-gray-700 text-xl font-bold"
                >
                  ×
                </button>
              </div>
              
              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {groupByTime(selectedGroup).map(([timeSlot, courses]) => (
                  <div key={timeSlot}>
                    {/* Time header */}
                    <div className="text-sm font-bold text-gray-600 mb-2 bg-gray-100 px-2 py-1 rounded">
                      {timeSlot}
                    </div>
                    {/* Course cards - 2 column grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {courses.map((course) => {
                        const courseId = `${course.courseCode}-${course.section}`
                        const isGlowing = glowingCourses.has(`detail-${courseId}`)
                        return (
                          <div 
                            key={courseId}
                            className={cn(
                              "p-3 rounded-lg border-2 transition-all duration-200",
                              course.seatLeft === 0 ? "bg-red-50 border-red-300" :
                              course.seatLeft / course.seatLimit < 0.25 ? "bg-orange-50 border-orange-300" :
                              course.seatLeft / course.seatLimit < 0.5 ? "bg-amber-50 border-amber-300" :
                              "bg-emerald-50 border-emerald-300",
                              isGlowing && `shadow-${GLOW_SIZE}`,
                              isGlowing && getGlowColor(course.seatLeft, course.seatLimit)
                            )}
                          >
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-gray-800">{course.courseCode}</span>
                              <span className={cn(
                                "px-2 py-0.5 rounded text-xs font-bold text-white inline-flex items-center",
                                course.seatLeft === 0 ? "bg-red-500" :
                                course.seatLeft / course.seatLimit < 0.25 ? "bg-orange-500" :
                                course.seatLeft / course.seatLimit < 0.5 ? "bg-amber-500" :
                                "bg-emerald-500"
                              )}>
                                <AnimatedNumber value={course.seatLeft} onChangeDirection={(dir) => handleDetailGlow(courseId, dir)} /><span>/{course.seatLimit}</span>
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">{course.courseTitle}</p>
                            <div className="text-xs text-gray-500 mt-2">
                              <div>Section: {course.section}</div>
                              <div>Instructor: {course.instructor}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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

          {/* Time table box - key forces re-render on URL param changes */}
          <div 
            key={`timetable-${urlCourse}-${urlSection}-${urlDb}`}
            className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-md"
          >
            {/* Grid - Time table structure without courses */}
            <div>
              {DAYS.map((day, idx) => (
                <div
                  key={day}
                  className={cn(
                    'relative h-[72px]',
                    idx > 0 && 'border-t border-gray-200'
                  )}
                >
                  {/* Day label */}
                  <div className="absolute left-0 top-0 bottom-0 w-[70px] flex items-center justify-center font-semibold text-gray-500 bg-white border-r border-gray-200">
                    {day.slice(0, 3).toUpperCase()}
                  </div>

                  {/* Time slots grid */}
                  <div 
                    className="absolute left-[70px] right-0 top-0 bottom-0"
                    style={{
                      backgroundImage: 'linear-gradient(to right, #e5e7eb 1px, transparent 1px)',
                      backgroundSize: `${100 / CELLS}% 100%`,
                    }}
                  >
                    {/* Course blocks for this day - filtered by search and advanced filters */}
                    {filteredCoursesByDay[day]?.map((group, groupIdx) => {
                      // Filter courses in group by search input AND advanced filters
                      const filteredCourses = group.courses.filter(c => {
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
                      
                      // Skip if no courses match the filter
                      if (filteredCourses.length === 0) return null
                      
                      // Use first filtered course as the display course
                      const displayCourse = filteredCourses[0]
                      
                      // When filtering, use actual course times instead of group times
                      // This prevents showing extended timeline for stacked courses
                      const hasActiveFilter = searchInput.trim() || hasActiveFilters
                      const courseStartMin = timeToMinutes(displayCourse.startTime)
                      const courseEndMin = timeToMinutes(displayCourse.endTime)
                      const useStartMin = hasActiveFilter ? courseStartMin : group.startMin
                      const useSpanMin = hasActiveFilter ? (courseEndMin - courseStartMin) : (group.endMin - group.startMin)
                      
                      return (
                        <CourseBlock
                          key={`${day}-group-${groupIdx}`}
                          course={displayCourse}
                          startMin={useStartMin}
                          spanMin={useSpanMin}
                          groupStartMin={START_MIN}
                          groupSpanMin={SPAN_MIN}
                          stackTotal={filteredCourses.length}
                          stackedCourses={filteredCourses}
                          onClick={() => handleCourseClick(filteredCourses)}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Empty state when no courses found */}
            {urlCourse && urlSection && Object.keys(filteredCoursesByDay).length === 0 && !isLoading && (
              <div className="mt-8 text-center py-12 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="text-amber-600 text-lg font-semibold mb-2">
                  ⚠️ Course Section Not Found
                </div>
                <p className="text-gray-600 text-sm">
                  {urlCourse} - Section {urlSection} is not currently full or doesn't exist in the {databaseMode === 'test' ? 'Test' : 'Default'} database.
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  The section may have seats available now, or the data may have changed.
                </p>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
      )}
      </div>

      {/* Analytics Frame - Full width, only visible on ALL day section */}
      <div 
        className={cn(
          "bg-white border border-gray-200 rounded-2xl shadow-md overflow-hidden transition-all duration-500 ease-in-out",
          filters.activeDay !== 'ALL' ? "opacity-0 translate-y-8 pointer-events-none h-0 mt-0 p-0 border-0" : "mt-4"
        )}
        style={{ marginLeft: '-350px', marginRight: '-350px', position: 'relative' }}
      >
        <div className="p-3 flex gap-4">
          {/* Left side - Overall Stats */}
          <div className="flex-1">
            {/* Compact Stats Row */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="bg-gray-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-gray-800"><AnimatedNumber value={analyticsData.overall.totalCourses} /></div>
                <div className="text-[10px] text-gray-500">Total</div>
              </div>
              <div className="bg-red-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-red-600"><AnimatedNumber value={analyticsData.overall.fullCourses} /></div>
                <div className="text-[10px] text-red-500">Full</div>
              </div>
              <div className="bg-orange-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-orange-600"><AnimatedNumber value={analyticsData.overall.almostFullCourses} /></div>
                <div className="text-[10px] text-orange-500">&lt;25%</div>
              </div>
              <div className="bg-emerald-50 rounded-md p-2 text-center">
                <div className="text-lg font-bold text-emerald-600"><AnimatedNumber value={analyticsData.overall.availableCourses} /></div>
                <div className="text-[10px] text-emerald-500">≥25%</div>
              </div>
            </div>
            
            {/* Seat Overall Bar */}
            {(() => {
              const utilizationPercent = analyticsData.overall.totalSeats > 0 ? (analyticsData.overall.usedSeats / analyticsData.overall.totalSeats * 100) : 0
              const barColor = utilizationPercent >= 90 ? 'bg-red-500' : utilizationPercent >= 75 ? 'bg-orange-500' : utilizationPercent >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
              return (
                <div>
                  <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                    <span>Seat Overall</span>
                    <span><AnimatedNumber value={analyticsData.overall.usedSeats} /> / <AnimatedNumber value={analyticsData.overall.totalSeats} /> ({Math.round(utilizationPercent)}%)</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${barColor} transition-all duration-500`}
                      style={{ width: `${utilizationPercent}%` }}
                    />
                  </div>
                </div>
              )
            })()}
          </div>
          
          {/* Divider */}
          <div className="w-px bg-gray-200" />
          
          {/* Right side - Prefix Breakdown (4x2 grid) */}
          <div className="flex-1">
            <div className="text-[10px] text-gray-500 mb-1.5">By Department/Prefix</div>
            <div className="grid grid-cols-4 gap-1.5">
              {analyticsData.prefixStats.map(([prefix, stats]) => {
                const fullPercent = stats.total > 0 ? (stats.full / stats.total * 100) : 0
                const almostFullPercent = stats.total > 0 ? (stats.almostFull / stats.total * 100) : 0
                const availablePercent = stats.total > 0 ? (stats.available / stats.total * 100) : 0
                
                return (
                  <div key={prefix} className="bg-gray-50 rounded-md p-1.5">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="font-semibold text-gray-700 text-xs">{prefix}</span>
                      <span className="text-[10px] text-gray-400"><AnimatedNumber value={stats.total} /></span>
                    </div>
                    {/* Stacked bar - animated */}
                    <div className="h-1 bg-gray-200 rounded-full overflow-hidden flex">
                      <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${fullPercent}%` }} />
                      <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${almostFullPercent}%` }} />
                      <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${availablePercent}%` }} />
                    </div>
                    <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                      <span className="text-red-500"><AnimatedNumber value={stats.full} /></span>
                      <span className="text-orange-500"><AnimatedNumber value={stats.almostFull} /></span>
                      <span className="text-emerald-500"><AnimatedNumber value={stats.available} /></span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Filter Popup - Fixed position floating modal */}
      {showAdvancedFilter && (
        <>
          {/* Backdrop with fade animation */}
          <div 
            className="fixed inset-0 bg-black/30 z-[100] animate-in fade-in duration-200 backdrop-blur-sm"
            onClick={() => setShowAdvancedFilter(false)}
          />
          {/* Modal with scale + fade animation */}
          <div 
            ref={filterRef}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] bg-white border border-gray-200 rounded-2xl shadow-2xl z-[101] overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300"
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
        </>
      )}

    </div>
  )
}
