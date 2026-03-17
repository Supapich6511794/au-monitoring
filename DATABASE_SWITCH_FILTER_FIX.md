# Database Switch Filter Fix - Clearing Stale Filters

## 🐞 Problem

When users manually switched databases, course and section filters persisted, causing errors:

### Scenario
1. User clicks "View in Timetable" from a FULL course notification
   - Navigates with: `db=test`, `course=AE3411`, `section=541`
   - Timetable correctly shows ONLY that full course section ✓

2. User manually switches database dropdown to "default"
   - System keeps previous `course=AE3411` and `section=541` filters
   - Result: **"Course Section Not Found"** ❌
   - Reason: AE3411-541 doesn't exist or isn't full in default database

3. Expected behavior:
   - Switching to "default" should RESET to full timetable view
   - Should display ALL courses (normal view)

## 🎯 Root Cause

**Stale URL Parameters:**
```typescript
// URL after navigation from modal:
/course-monitoring?search=AE3411&db=test&section=541&autoOpen=true

// After user changes database dropdown:
// URL STILL has: ?search=AE3411&section=541
// But database is now "default"
// → AE3411-541 not found in default DB → Error
```

**Filter Persistence:**
- `filteredCoursesByDay` continued filtering by `urlCourse` and `urlSection`
- These URL params persisted even after database change
- No mechanism to clear filters when user manually switches database

## ✅ Solution Implemented

### 1. Added Router Import

```typescript
import { useSearchParams, useRouter } from 'next/navigation'

export function CourseGrid() {
  const searchParams = useSearchParams()
  const router = useRouter()
  // ...
}
```

### 2. Updated Database Dropdown Handler

**Before (Broken):**
```typescript
onChange={(e) => {
  setUserChangedDB(true)
  setDatabaseMode(e.target.value as DatabaseMode)
  // ❌ URL params persist
  // ❌ Filters remain active
  // ❌ Shows "Course Section Not Found"
}}
```

**After (Fixed):**
```typescript
onChange={(e) => {
  const newDb = e.target.value as DatabaseMode
  console.log('[CourseGrid] User manually changed database to:', newDb)
  
  // Mark that user manually changed database
  setUserChangedDB(true)
  setDatabaseMode(newDb)
  
  // CRITICAL FIX: Clear URL params and filters
  router.push('/course-monitoring', { scroll: false })
  
  // Clear local search state
  setSearchInput('')
  setSearch('')
  
  // Close detail panel
  setSelectedGroupIds(null)
  
  console.log('[CourseGrid] Cleared filters - showing full timetable')
}}
```

### 3. What Gets Cleared

When user manually changes database:

✅ **URL Parameters:**
- `search` (course code)
- `section` (section number)
- `autoOpen` (detail panel flag)
- `db` (database parameter)

✅ **Local State:**
- `searchInput` → cleared to `''`
- `filters.search` → cleared via `setSearch('')`
- `selectedGroupIds` → cleared to `null`

✅ **UI State:**
- Detail panel closes
- Search dropdown closes
- Timetable shows ALL courses

## 🔄 Flow Diagram

### Before Fix (Broken)
```
User clicks "View in Timetable" (AE3411-541)
  ↓
URL: /course-monitoring?search=AE3411&db=test&section=541&autoOpen=true
  ↓
Database: test, Filters: AE3411-541
  ↓
Shows ONLY AE3411-541 ✓
  ↓
User changes dropdown to "default"
  ↓
Database: default
URL: STILL ?search=AE3411&section=541 ❌
  ↓
filteredCoursesByDay filters for AE3411-541
  ↓
Not found in default DB → "Course Section Not Found" ❌
```

### After Fix (Working)
```
User clicks "View in Timetable" (AE3411-541)
  ↓
URL: /course-monitoring?search=AE3411&db=test&section=541&autoOpen=true
  ↓
Database: test, Filters: AE3411-541
  ↓
Shows ONLY AE3411-541 ✓
  ↓
User changes dropdown to "default"
  ↓
Database: default
router.push('/course-monitoring') → URL: /course-monitoring ✓
setSearchInput('') ✓
setSearch('') ✓
setSelectedGroupIds(null) ✓
  ↓
filteredCoursesByDay = coursesByDay (no filtering) ✓
  ↓
Shows FULL timetable with ALL courses ✓
```

## 📊 Test Scenarios

### Scenario 1: Modal → Default Database
1. Click "View in Timetable" for AE3411-541 (full course)
   - **Expected:** Database = "test", shows ONLY AE3411-541 ✅
2. Change dropdown to "default"
   - **Expected:** URL cleared, shows ALL courses ✅
   - **Expected:** No "Course Section Not Found" error ✅

### Scenario 2: Modal → Default → Test
1. Click "View in Timetable" for CSX4609-542
   - **Expected:** Database = "test", shows ONLY CSX4609-542 ✅
2. Change dropdown to "default"
   - **Expected:** Shows ALL courses ✅
3. Change dropdown back to "test"
   - **Expected:** Shows ALL courses (filters NOT reapplied) ✅
   - **Expected:** No automatic filtering ✅

### Scenario 3: Multiple Database Switches
1. Start on "default" database
2. Switch to "test"
   - **Expected:** Shows ALL courses ✅
3. Switch back to "default"
   - **Expected:** Shows ALL courses ✅
4. No stale filters at any point ✅

### Scenario 4: Search After Database Switch
1. Click "View in Timetable" for AE3411-541
2. Change database to "default"
   - **Expected:** Search input cleared ✅
3. User manually searches for "CSX"
   - **Expected:** Search works normally ✅

## 🔑 Key Principles

### 1. **Database Switch = New Context**
- Manual database change is treated as starting fresh
- All filters from previous context are cleared
- User sees full timetable, not filtered view

### 2. **Separation of Navigation States**

**From Modal (Automatic):**
- URL params applied
- Filters active
- Detail panel opens
- Shows specific course

**Manual Database Change (User Action):**
- URL params cleared
- Filters cleared
- Detail panel closes
- Shows all courses

### 3. **No Automatic Reapplication**
- After database switch, filters don't auto-reapply
- User must explicitly navigate from modal again
- Prevents confusion and unexpected behavior

## 🎯 Behavior Matrix

| Action | Database | URL Params | Filters | View |
|--------|----------|------------|---------|------|
| Click "View in Timetable" | Set to "test" | Applied | Active | Single course |
| User changes to "default" | Changed | **Cleared** | **Cleared** | All courses |
| User changes to "test" | Changed | **Cleared** | **Cleared** | All courses |
| User searches manually | Unchanged | Unchanged | Applied | Filtered |

## 🚫 Anti-Patterns Avoided

### ❌ Don't: Keep filters across database changes
```typescript
// BAD: Filters persist
onChange={(e) => {
  setDatabaseMode(e.target.value)
  // URL params still active → error
}}
```

### ❌ Don't: Auto-reapply filters
```typescript
// BAD: Filters reapply automatically
useEffect(() => {
  if (databaseMode === 'test' && urlCourse) {
    applyFilters() // Wrong - user didn't request this
  }
}, [databaseMode])
```

### ✅ Do: Clear everything on manual change
```typescript
// GOOD: Clean slate
onChange={(e) => {
  setDatabaseMode(e.target.value)
  router.push('/course-monitoring') // Clear URL
  setSearchInput('')
  setSearch('')
  setSelectedGroupIds(null)
}}
```

## 📝 Files Modified

**`src/components/CourseGrid.tsx`**
- Added `useRouter` import
- Added `router` instance
- Updated database dropdown `onChange` handler
- Added URL clearing logic
- Added filter clearing logic
- Added detail panel closing logic

## 🎯 Result

✅ **Modal Navigation:** Works as expected (filtered view)  
✅ **Manual Database Switch:** Clears filters (full timetable)  
✅ **No Stale Filters:** Clean state after every switch  
✅ **No Errors:** "Course Section Not Found" eliminated  
✅ **User Control:** Database switching is smooth and predictable  

## 🔮 Edge Cases Handled

1. **Rapid Database Switching:**
   - Each switch clears state properly
   - No race conditions

2. **Switch While Loading:**
   - Filters cleared immediately
   - New database loads with clean state

3. **Switch With Detail Panel Open:**
   - Panel closes automatically
   - No orphaned state

4. **Switch After Manual Search:**
   - Search cleared
   - Fresh start in new database

## 💡 User Experience

**Before:**
- User confused why course not found
- Had to manually clear search
- Unexpected behavior

**After:**
- Database switch = fresh start
- Predictable behavior
- Smooth transitions
- No errors
