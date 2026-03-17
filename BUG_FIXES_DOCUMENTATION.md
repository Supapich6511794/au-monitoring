# Critical Bug Fixes - Course Monitoring Timetable System

## Overview
Fixed three critical bugs affecting the "View in Timetable" navigation feature from Course Full notifications.

---

## 🐞 BUG 1: Stale Course Data (State Not Updating)

### Problem
When users clicked "View in Timetable" multiple times, the UI showed stale data:
- Click CSX4609 → works ✓
- Click AE3411 → UI still shows CSX4609 ✗

### Root Cause
The `hasProcessedUrlParams.current` ref prevented re-processing when URL parameters changed, causing the component to ignore subsequent navigation requests.

### Solution Implemented

**Before:**
```typescript
const hasProcessedUrlParams = useRef(false)

useEffect(() => {
  if (hasProcessedUrlParams.current || isLoading) return
  // ... processing logic
  hasProcessedUrlParams.current = true // ❌ Blocks future updates
}, [searchParams, ...])
```

**After:**
```typescript
// Extract URL params as reactive values
const urlCourse = searchParams.get('search')
const urlDb = searchParams.get('db')
const urlSection = searchParams.get('section')
const urlAutoOpen = searchParams.get('autoOpen')

// Separate useEffect for database sync (reactive)
useEffect(() => {
  if (urlDb && urlDb !== databaseMode) {
    console.log('[CourseGrid] Syncing database mode from URL:', urlDb)
    setDatabaseMode(urlDb as DatabaseMode)
  }
}, [urlDb, databaseMode, setDatabaseMode])

// Main URL processing (reactive, no caching)
useEffect(() => {
  if (isLoading) return
  
  // Clear previous selection first (prevent stale data)
  setSelectedGroupIds(null)
  
  // Apply new filters
  if (urlCourse) {
    setSearchInput(urlCourse)
    setSearch(urlCourse)
  }
  
  // Set new selection after brief delay
  setTimeout(() => {
    setSelectedGroupIds(matchingCourses.map(c => ({ 
      courseCode: c.courseCode, 
      section: c.section 
    })))
  }, 50)
}, [urlCourse, urlSection, urlAutoOpen, isLoading, allCourses, setSearch])
```

**Key Changes:**
1. ✅ Removed `hasProcessedUrlParams` ref
2. ✅ Extract URL params as reactive values
3. ✅ Clear previous selection before setting new one
4. ✅ Dependencies include all URL params for reactivity

---

## 🐞 BUG 2: Show ONLY Full Section (Not All Sections)

### Problem
Timetable showed ALL sections of a course instead of ONLY the FULL section that was clicked.

Example:
- User clicks AE3411 Section 541 (FULL)
- Timetable shows AE3411 Sections 541, 542, 543 (all sections)

### Root Cause
Filtering logic only matched course code, not section ID, and didn't check if section was full.

### Solution Implemented

**Created filtered version of coursesByDay:**
```typescript
// FIX BUG 2: Filter coursesByDay to show ONLY the specific section from URL
const filteredCoursesByDay = useMemo((): Record<string, CourseGroup[]> => {
  // If no URL params, show all courses
  if (!urlCourse || !urlSection) {
    return coursesByDay
  }
  
  // Filter to show ONLY the specific course + section
  const result: Record<string, CourseGroup[]> = {}
  
  Object.entries(coursesByDay).forEach(([day, groups]) => {
    const filteredGroups = groups
      .map(group => ({
        ...group,
        courses: group.courses.filter(c => 
          c.courseCode.toLowerCase() === urlCourse.toLowerCase() &&
          c.section === urlSection &&
          c.seatLeft === 0 // ✅ ONLY show full sections
        )
      }))
      .filter(group => group.courses.length > 0)
    
    if (filteredGroups.length > 0) {
      result[day] = filteredGroups
    }
  })
  
  return result
}, [coursesByDay, urlCourse, urlSection])
```

**Updated timetable rendering:**
```typescript
// Before: {coursesByDay[day]?.map(...)}
// After:
{filteredCoursesByDay[day]?.map((group, groupIdx) => {
  // ... render only filtered courses
})}
```

**Detail panel filtering:**
```typescript
// FIX BUG 2: Filter to show ONLY the full section clicked
const matchingCourses = allCourses.filter(c => {
  const codeMatch = c.courseCode.toLowerCase() === urlCourse.toLowerCase()
  const sectionMatch = urlSection ? c.section === urlSection : true
  const isFullSection = c.seatLeft === 0 // ✅ ONLY show full sections
  
  return codeMatch && sectionMatch && isFullSection
})
```

**Key Changes:**
1. ✅ Created `filteredCoursesByDay` that filters by course + section + full status
2. ✅ Replaced `coursesByDay` with `filteredCoursesByDay` in timetable rendering
3. ✅ Added `c.seatLeft === 0` check to ensure only full sections shown
4. ✅ Each section treated as unique entity

---

## 🐞 BUG 3: Database Not Syncing (Test vs Default)

### Problem
UI showed "Database: Test" but data was still from Default database. Only worked after manually switching dropdown.

### Root Cause
Database mode state change didn't trigger data refetch, and URL param processing happened before database mode was set.

### Solution Implemented

**Separate useEffect for database sync:**
```typescript
// FIX BUG 3: Sync database mode from URL (reactive)
useEffect(() => {
  if (urlDb && urlDb !== databaseMode) {
    console.log('[CourseGrid] Syncing database mode from URL:', urlDb)
    setDatabaseMode(urlDb as DatabaseMode)
  }
}, [urlDb, databaseMode, setDatabaseMode])
```

**Key Changes:**
1. ✅ Dedicated useEffect for database mode sync
2. ✅ Runs independently before course filtering
3. ✅ `setDatabaseMode` triggers data refetch in `useCourses` hook
4. ✅ Reactive to `urlDb` changes

**Data Flow:**
```
URL Change → urlDb changes → setDatabaseMode('test') 
→ useCourses refetches from data_vme_test 
→ coursesByDay updates 
→ filteredCoursesByDay updates 
→ UI re-renders with correct data
```

---

## 🔑 Force Re-render with Key Prop

### Problem
React may reuse DOM elements when URL params change, causing stale renders.

### Solution
Added key prop to timetable container:

```typescript
<div 
  key={`timetable-${urlCourse}-${urlSection}-${urlDb}`}
  className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-md"
>
  {/* Timetable content */}
</div>
```

**Effect:**
- Key changes when any URL param changes
- Forces React to unmount and remount the component
- Ensures fresh render with new data
- Prevents any stale state issues

---

## 🎯 Edge Case Handling

### Empty State
When no courses match the filter (section not full anymore or doesn't exist):

```typescript
{urlCourse && urlSection && Object.keys(filteredCoursesByDay).length === 0 && !isLoading && (
  <div className="mt-8 text-center py-12 bg-amber-50 border border-amber-200 rounded-lg">
    <div className="text-amber-600 text-lg font-semibold mb-2">
      ⚠️ Course Section Not Found
    </div>
    <p className="text-gray-600 text-sm">
      {urlCourse} - Section {urlSection} is not currently full or doesn't exist 
      in the {databaseMode === 'test' ? 'Test' : 'Default'} database.
    </p>
    <p className="text-gray-500 text-xs mt-2">
      The section may have seats available now, or the data may have changed.
    </p>
  </div>
)}
```

### Console Logging
Added debug logs for troubleshooting:
- Database mode sync
- Search filter application
- Course matching results

---

## 📊 Testing Scenarios

### Test Case 1: Multiple Course Navigation
1. Click "View in Timetable" for CSX4609 Section 541
   - ✅ Shows CSX4609-541 only
   - ✅ Database: Test selected
   - ✅ Detail panel opens
2. Click "View in Timetable" for AE3411 Section 542
   - ✅ Shows AE3411-542 only (CSX4609 cleared)
   - ✅ Database: Test remains selected
   - ✅ Detail panel updates

### Test Case 2: Database Sync
1. Start on Default database
2. Click "View in Timetable" (db=test in URL)
   - ✅ Database switches to Test
   - ✅ Data refetches from data_vme_test
   - ✅ Course appears if exists in test DB

### Test Case 3: Section Filtering
1. Course has sections 541, 542, 543
2. Only section 542 is full
3. Click "View in Timetable" for section 542
   - ✅ Shows ONLY section 542
   - ✅ Sections 541 and 543 not shown
   - ✅ Red badge shows 0 seats left

### Test Case 4: Edge Cases
1. Click course that's no longer full
   - ✅ Shows empty state message
   - ✅ Explains section may have seats now
2. Click course that doesn't exist
   - ✅ Shows empty state message
   - ✅ No errors in console

---

## 🔄 Data Flow Summary

```
User clicks "View in Timetable"
    ↓
GCPHeader.handleViewCourse()
    ↓
router.push('/course-monitoring?search=AE3411&db=test&section=541&autoOpen=true')
    ↓
CourseGrid component receives new searchParams
    ↓
urlCourse, urlDb, urlSection, urlAutoOpen update (reactive)
    ↓
useEffect #1: Database sync
  - setDatabaseMode('test')
  - useCourses refetches from data_vme_test
    ↓
useEffect #2: Course filtering
  - setSearchInput('AE3411')
  - setSearch('AE3411')
  - Filter courses: code=AE3411 AND section=541 AND seatLeft=0
  - setSelectedGroupIds([{courseCode: 'AE3411', section: '541'}])
    ↓
filteredCoursesByDay updates (useMemo)
    ↓
Timetable re-renders with key prop
    ↓
Shows ONLY AE3411-541 with detail panel open
```

---

## 📝 Files Modified

1. **`src/components/CourseGrid.tsx`**
   - Removed `hasProcessedUrlParams` ref
   - Added reactive URL param extraction
   - Split database sync into separate useEffect
   - Created `filteredCoursesByDay` for section filtering
   - Replaced `coursesByDay` with `filteredCoursesByDay` in rendering
   - Added key prop to timetable container
   - Added empty state message
   - Added console logging for debugging

---

## ✅ Verification Checklist

- [x] Bug 1: State updates on every URL change
- [x] Bug 2: Shows ONLY the specific full section
- [x] Bug 3: Database mode syncs before data fetch
- [x] Key prop forces re-render on navigation
- [x] Empty state handles edge cases
- [x] Console logs aid debugging
- [x] No infinite loops or performance issues
- [x] Works with multiple rapid navigations
- [x] Detail panel opens automatically
- [x] Red badge shows for full sections

---

## 🚀 Performance Considerations

1. **useMemo for filteredCoursesByDay**: Prevents unnecessary recalculations
2. **Separate useEffects**: Database sync runs independently from filtering
3. **50ms delay before selection**: Prevents race conditions
4. **Key prop**: Forces clean re-render, prevents stale DOM

---

## 🔮 Future Improvements

1. Add loading skeleton while switching databases
2. Animate transition between course selections
3. Add "Back to all courses" button when filtered
4. Persist filter state in URL for shareable links
5. Add analytics tracking for navigation patterns
