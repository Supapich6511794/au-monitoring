# Course Click Fix - Detail Panel Not Opening

## 🐞 Problem

After implementing the database switch filter fix, users could no longer click on courses to open the detail panel (left slide).

**Symptoms:**
- User clicks on a course block
- Detail panel doesn't open
- No error messages
- `handleCourseClick` is called but `selectedGroupIds` gets immediately cleared

## 🎯 Root Cause

The URL parameter processing `useEffect` was running **continuously** and clearing `selectedGroupIds` whenever there were no URL params.

### The Bug Flow

```typescript
// User clicks course
handleCourseClick([course])
  ↓
setSelectedGroupIds([{ courseCode: 'AE3411', section: '541' }])
  ↓
// useEffect runs (because selectedGroupIds is in dependency array)
useEffect(() => {
  if (!urlCourse && !urlAutoOpen) {
    // No URL params - clear selectedGroupIds
    setSelectedGroupIds(null) // ❌ Immediately clears user's selection!
  }
}, [urlCourse, urlAutoOpen, selectedGroupIds]) // selectedGroupIds causes re-run
```

**Why this happened:**
1. After database switch, URL is cleared: `/course-monitoring` (no params)
2. User clicks a course → `setSelectedGroupIds` is called
3. `selectedGroupIds` changes → useEffect runs
4. useEffect sees no URL params → clears `selectedGroupIds`
5. Detail panel never opens

## ✅ Solution Implemented

### 1. Track Previous URL Parameters

Added a ref to track previous URL param values:

```typescript
// Track previous URL params to detect actual changes
const prevUrlParamsRef = useRef({ 
  course: urlCourse, 
  section: urlSection, 
  autoOpen: urlAutoOpen 
})
```

### 2. Only Process When URL Params Actually Change

```typescript
useEffect(() => {
  if (isLoading) return
  
  // Check if URL params actually changed
  const urlParamsChanged = 
    prevUrlParamsRef.current.course !== urlCourse ||
    prevUrlParamsRef.current.section !== urlSection ||
    prevUrlParamsRef.current.autoOpen !== urlAutoOpen
  
  // Only process if URL params changed
  if (!urlParamsChanged) return
  
  // Update ref
  prevUrlParamsRef.current = { 
    course: urlCourse, 
    section: urlSection, 
    autoOpen: urlAutoOpen 
  }
  
  // Now process URL params...
}, [urlCourse, urlSection, urlAutoOpen, isLoading, allCourses, searchInput])
```

### 3. Removed selectedGroupIds from Dependencies

**Before:**
```typescript
}, [urlCourse, urlSection, urlAutoOpen, isLoading, allCourses, searchInput, selectedGroupIds])
// ❌ selectedGroupIds causes effect to run when user clicks course
```

**After:**
```typescript
}, [urlCourse, urlSection, urlAutoOpen, isLoading, allCourses, searchInput])
// ✅ Effect only runs when URL params or data changes
```

### 4. Removed Automatic selectedGroupIds Clearing

**Before:**
```typescript
if (!urlCourse && !urlAutoOpen) {
  if (searchInput) {
    setSearchInput('')
    setSearch('')
  }
  if (selectedGroupIds) {
    setSelectedGroupIds(null) // ❌ Clears user's manual selection
  }
  return
}
```

**After:**
```typescript
if (!urlCourse && !urlAutoOpen) {
  console.log('[CourseGrid] URL params cleared - resetting filters')
  // Clear search filters
  if (searchInput) {
    setSearchInput('')
    setSearch('')
  }
  // ✅ Don't clear selectedGroupIds - let user click courses freely
  return
}
```

## 🔄 Flow Diagram

### Before Fix (Broken)
```
User clicks course AE3411
  ↓
handleCourseClick([course])
  ↓
setSelectedGroupIds([{ courseCode: 'AE3411', section: '541' }])
  ↓
selectedGroupIds changes → useEffect runs
  ↓
Effect sees: urlCourse = null, urlAutoOpen = null
  ↓
Effect clears: setSelectedGroupIds(null) ❌
  ↓
Detail panel doesn't open
```

### After Fix (Working)
```
User clicks course AE3411
  ↓
handleCourseClick([course])
  ↓
setSelectedGroupIds([{ courseCode: 'AE3411', section: '541' }])
  ↓
useEffect checks: Did URL params change?
  ↓
No change detected (prevUrlParamsRef matches current)
  ↓
useEffect returns early (doesn't process) ✅
  ↓
selectedGroupIds stays set
  ↓
Detail panel opens successfully ✅
```

## 📊 Test Scenarios

### Scenario 1: Normal Course Click
1. User is on `/course-monitoring` (no URL params)
2. User clicks course AE3411-541
3. **Expected:** Detail panel opens ✅
4. **Expected:** Shows course details ✅

### Scenario 2: Click After Database Switch
1. Navigate from modal with `db=test&course=CSX4609`
2. User switches database to "default"
3. URL cleared to `/course-monitoring`
4. User clicks course AE3411-542
5. **Expected:** Detail panel opens ✅
6. **Expected:** No interference from URL logic ✅

### Scenario 3: Click Multiple Courses
1. User clicks course AE3411
2. Detail panel opens
3. User clicks course CSX4609
4. **Expected:** Detail panel updates to CSX4609 ✅
5. **Expected:** No clearing between clicks ✅

### Scenario 4: Navigate from Modal Then Click
1. Click "View in Timetable" for AE3411-541
2. Detail panel opens for AE3411-541
3. User closes detail panel
4. User clicks different course CSX4609-542
5. **Expected:** Detail panel opens for CSX4609-542 ✅

## 🔑 Key Principles

### 1. **Detect Actual Changes, Not Just State**
- Use refs to track previous values
- Only process when values actually change
- Prevents unnecessary re-runs

### 2. **Separate URL-Driven vs User-Driven Actions**

**URL-Driven (from modal):**
- URL params present
- Auto-open detail panel
- Apply filters

**User-Driven (manual click):**
- No URL params
- User clicks course
- Detail panel opens
- No interference from URL logic

### 3. **Minimal Dependencies**
- Remove state from dependencies if it causes unwanted re-runs
- Use refs for tracking without triggering effects
- Only depend on actual inputs that should trigger processing

## 🚫 Anti-Patterns Avoided

### ❌ Don't: Include state in dependencies if it causes loops
```typescript
// BAD: selectedGroupIds in deps causes re-run when user clicks
useEffect(() => {
  // ...
}, [selectedGroupIds])
```

### ❌ Don't: Clear state unconditionally
```typescript
// BAD: Always clears, even for manual clicks
if (!urlCourse) {
  setSelectedGroupIds(null)
}
```

### ✅ Do: Track changes with refs
```typescript
// GOOD: Only process actual changes
const prevRef = useRef(value)
if (prevRef.current !== value) {
  // Process change
  prevRef.current = value
}
```

### ✅ Do: Separate concerns
```typescript
// GOOD: URL logic doesn't interfere with manual clicks
if (urlAutoOpen === 'true') {
  // Handle URL-driven opening
}
// Manual clicks handled separately via handleCourseClick
```

## 📝 Files Modified

**`src/components/CourseGrid.tsx`**
- Added `prevUrlParamsRef` to track URL param changes
- Updated URL processing useEffect to only run on actual changes
- Removed `selectedGroupIds` from dependency array
- Removed automatic clearing of `selectedGroupIds`

## 🎯 Result

✅ **Course Clicks Work:** Users can click courses to open detail panel  
✅ **No Interference:** URL logic doesn't clear manual selections  
✅ **Database Switch Works:** Filters clear on database change  
✅ **Modal Navigation Works:** Auto-open from notifications works  
✅ **Multiple Clicks Work:** Can click different courses sequentially  

## 🔮 Edge Cases Handled

1. **Click While Loading:**
   - Effect skips if `isLoading` is true
   - Click works after loading completes

2. **Rapid Clicks:**
   - Each click updates `selectedGroupIds`
   - No clearing between clicks

3. **Click After URL Clear:**
   - URL params cleared (no course/section)
   - User clicks still work normally

4. **Navigate Then Click:**
   - URL params applied initially
   - User can then click other courses
   - No conflict between URL and manual selection

## 💡 Lessons Learned

1. **State in Dependencies Can Cause Loops:**
   - Be careful adding state to useEffect dependencies
   - Consider if state changes should trigger the effect

2. **Track Changes, Not Just Values:**
   - Use refs to detect actual changes
   - Prevents processing same values repeatedly

3. **Separate Concerns:**
   - URL-driven behavior vs user-driven behavior
   - Don't let one interfere with the other

4. **Test User Interactions:**
   - Always test manual user actions
   - Don't just test programmatic flows
