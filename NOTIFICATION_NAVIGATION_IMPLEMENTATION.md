# Notification "View in Timetable" Button - Implementation Summary

## Overview
Modified the "View in Timetable" button behavior to automatically configure the Course Monitoring page when navigating from Course Full notifications.

## Changes Made

### 1. GCPHeader.tsx - Enhanced Navigation Handler
**File:** `src/components/GCPHeader.tsx`

**Changes:**
- Updated `handleViewCourse` function to include section parameter in URL
- Added `autoOpen=true` query parameter to trigger automatic detail panel opening
- URL format: `/course-monitoring?search={courseCode}&db=test&section={section}&autoOpen=true`

**Code:**
```typescript
const handleViewCourse = (courseCode: string, section?: string) => {
  setIsNotificationOpen(false)
  setTimeout(() => {
    const searchParam = encodeURIComponent(courseCode)
    const sectionParam = section ? `&section=${encodeURIComponent(section)}` : ''
    router.push(`/course-monitoring?search=${searchParam}&db=test${sectionParam}&autoOpen=true`)
  }, 150)
}
```

### 2. CourseGrid.tsx - URL Parameter Processing
**File:** `src/components/CourseGrid.tsx`

**Changes:**
- Added `useSearchParams` import from Next.js navigation
- Added `hasProcessedUrlParams` ref to prevent duplicate processing
- Implemented URL parameter processing logic with the following features:

#### Feature 1: Database Auto-Selection
- Reads `db` parameter from URL
- Automatically sets database mode to "test" when `db=test`
- Maps to `data_vme_test` dataset

#### Feature 2: Course Filtering
- Reads `search` parameter from URL
- Automatically filters timetable to show only the specified course
- Applies search filter to both search input and course data

#### Feature 3: Section-Specific Filtering
- Reads `section` parameter from URL (optional)
- When provided, filters to show only the specific section
- Example: `AE3411` section `541` → only shows AE3411-541

#### Feature 4: Auto-Open Detail Panel
- Reads `autoOpen` parameter from URL
- When `autoOpen=true`, automatically opens the Course Details panel
- Displays the filtered course(s) in the left slide panel
- Shows full status with red badge (0 seats left)
- Displays warning: "This course section is currently FULL"

**Code:**
```typescript
useEffect(() => {
  if (hasProcessedUrlParams.current || isLoading) return
  
  const search = searchParams.get('search')
  const db = searchParams.get('db')
  const section = searchParams.get('section')
  const autoOpen = searchParams.get('autoOpen')
  
  if (search || db) {
    hasProcessedUrlParams.current = true
    
    // 1. Auto-select database mode
    if (db === 'test' && databaseMode !== 'test') {
      setDatabaseMode('test')
    }
    
    // 2. Set search filter
    if (search) {
      setSearchInput(search)
      setSearch(search)
    }
    
    // 3. Auto-open detail panel
    if (autoOpen === 'true' && search) {
      setTimeout(() => {
        const matchingCourses = allCourses.filter(c => {
          const codeMatch = c.courseCode.toLowerCase() === search.toLowerCase()
          const sectionMatch = section ? c.section === section : true
          return codeMatch && sectionMatch
        })
        
        if (matchingCourses.length > 0) {
          setSelectedGroupIds(matchingCourses.map(c => ({ 
            courseCode: c.courseCode, 
            section: c.section 
          })))
        }
      }, 500)
    }
  }
}, [searchParams, isLoading, databaseMode, setDatabaseMode, setSearch, allCourses])
```

## User Flow

### Before (Old Behavior)
1. User clicks "View in Timetable" from notification modal
2. Navigates to Course Monitoring page
3. **User must manually:**
   - Select "Database: Test" from dropdown
   - Search for the course
   - Click on the course to see details

### After (New Behavior)
1. User clicks "View in Timetable" from notification modal
2. Navigates to Course Monitoring page
3. **Automatically:**
   - ✅ Database selector set to "Database: Test"
   - ✅ Course filter applied (only shows clicked course)
   - ✅ Course Details panel opens on the left
   - ✅ Full status clearly marked with red badge
   - ✅ Warning text: "This course section is currently FULL"

## Technical Details

### State Management
- Uses URL query parameters for state persistence
- No additional global state (Zustand/Context) needed
- Leverages existing `useCourses` hook for database mode
- Uses existing `selectedGroupIds` state for detail panel

### Database Mapping
- `db=test` → `data_vme_test` table (via `useCourses` hook)
- `db=default` → `data_vme` table (production data)

### Performance Considerations
- URL parameters processed only once per page load
- `hasProcessedUrlParams` ref prevents duplicate processing
- 500ms delay ensures data is loaded before opening detail panel
- Automatic cleanup when navigating away

## Testing Checklist

- [ ] Click "View in Timetable" from Course Full notification
- [ ] Verify database selector shows "Database: Test"
- [ ] Verify only the clicked course appears in timetable
- [ ] Verify Course Details panel opens automatically
- [ ] Verify red badge shows "0 seats left"
- [ ] Verify warning text displays correctly
- [ ] Test with different courses and sections
- [ ] Test navigation back and forth
- [ ] Verify URL parameters are correct

## Files Modified
1. `src/components/GCPHeader.tsx` - Navigation handler
2. `src/components/CourseGrid.tsx` - URL parameter processing

## Dependencies
- Next.js `useSearchParams` hook
- Existing `useCourses` hook
- Existing course filtering logic
- Existing detail panel component
