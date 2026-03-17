# Database Initialization Fix - Correct Table from Start

## 🐞 Problem

When clicking "View in Timetable" from a notification with `db=test`, the system initially showed data from the **default database** instead of the **test database**.

**Symptoms:**
- First image: ITX4606 shows with orange badge (seats available) - from default DB
- Second image: ITX4606 shows with red badge (0 seats) - from test DB
- Console shows: Fetches from `data_vme` first, then switches to `data_vme_test`

**Root Cause:**
The `useCourses` hook initialized with `databaseMode: 'default'` and immediately started fetching data, **before** the URL parameter could set it to `'test'`.

### Sequence (Before Fix):
```
1. Component mounts
2. useCourses() initializes with databaseMode: 'default'
3. useEffect runs → fetchCourses() from data_vme ❌
4. URL param effect runs → setDatabaseMode('test')
5. useEffect runs again → fetchCourses() from data_vme_test ✓
6. User sees wrong data briefly, then correct data
```

## ✅ Solution Implemented

### 1. Initialize Database Mode from URL Before useCourses

**Before:**
```typescript
export function CourseGrid() {
  const urlDb = searchParams.get('db')
  
  const {
    databaseMode,
    setDatabaseMode,
    ...
  } = useCourses() // ❌ Initializes with 'default'
  
  // Later, in useEffect:
  useEffect(() => {
    if (urlDb === 'test') {
      setDatabaseMode('test') // Too late - already fetched from default
    }
  }, [urlDb])
}
```

**After:**
```typescript
export function CourseGrid() {
  const urlDb = searchParams.get('db')
  
  // FIX: Compute initial database mode from URL BEFORE calling useCourses
  const initialDbMode = useMemo(() => {
    return (urlDb === 'test' ? 'test' : 'default') as DatabaseMode
  }, []) // Empty deps - only compute once on mount
  
  const {
    databaseMode,
    setDatabaseMode,
    ...
  } = useCourses(initialDbMode) // ✅ Initializes with correct mode
}
```

### 2. Update useCourses to Accept Initial Database Mode

**Before:**
```typescript
export function useCourses() {
  const [databaseMode, setDatabaseModeState] = useState<DatabaseMode>('default')
  // Always starts with 'default' ❌
}
```

**After:**
```typescript
export function useCourses(initialDatabaseMode: DatabaseMode = 'default') {
  const [databaseMode, setDatabaseModeState] = useState<DatabaseMode>(initialDatabaseMode)
  // Starts with URL-provided mode ✅
}
```

### 3. Removed Unnecessary Database Sync useEffect

The database sync useEffect is no longer needed since the database mode is already correct from the start:

```typescript
// REMOVED - No longer needed
useEffect(() => {
  if (!hasInitializedDB.current && !userChangedDB) {
    if (urlDb && urlDb !== databaseMode) {
      setDatabaseMode(urlDb as DatabaseMode)
    }
    hasInitializedDB.current = true
  }
}, [urlDb, databaseMode, setDatabaseMode, userChangedDB])
```

## 🔄 Flow Diagram

### Before Fix (Wrong Data First)
```
User clicks "View in Timetable" (db=test)
  ↓
Component mounts
  ↓
useCourses() initializes with databaseMode: 'default'
  ↓
fetchCourses() from data_vme ❌
  ↓
Shows ITX4606 with orange badge (seats available)
  ↓
URL param effect runs
  ↓
setDatabaseMode('test')
  ↓
fetchCourses() from data_vme_test ✓
  ↓
Shows ITX4606 with red badge (0 seats)
```

### After Fix (Correct Data Immediately)
```
User clicks "View in Timetable" (db=test)
  ↓
Component mounts
  ↓
initialDbMode computed from URL: 'test' ✓
  ↓
useCourses(initialDbMode) initializes with databaseMode: 'test'
  ↓
fetchCourses() from data_vme_test ✓
  ↓
Shows ITX4606 with red badge (0 seats) immediately ✓
```

## 📊 Expected Console Output (After Fix)

```
[useCourses] fetchCourses called, fetching from: data_vme_test
[useCourses] databaseMode changed to: test - fetching...
[useCourses] Fetched 226 courses from data_vme_test
[CourseGrid] Database mode: test
[CourseGrid] Total courses loaded: 179
[filteredCoursesByDay] ✅ Found match: ITX4606 541 seats: 0
```

**No more:**
- ❌ `fetchCourses from: data_vme` (wrong table)
- ❌ Double fetch on initial load
- ❌ Brief flash of wrong data

## 🎯 Result

✅ **Correct database from start** - No fetch from wrong table  
✅ **Single fetch** - No unnecessary double fetch  
✅ **Correct data immediately** - User sees test database data right away  
✅ **Red badge shows 0 seats** - Matches test database state  
✅ **No flash of wrong data** - Smooth user experience  

## 📝 Files Modified

**`src/hooks/useCourses.ts`**
- Added `initialDatabaseMode` parameter (defaults to `'default'`)
- Initialize `databaseMode` state with provided parameter

**`src/components/CourseGrid.tsx`**
- Added `initialDbMode` computed from URL params before calling `useCourses`
- Pass `initialDbMode` to `useCourses(initialDbMode)`
- Removed unnecessary database sync useEffect
- Removed `hasInitializedDB` ref (no longer needed)

## 🔑 Key Principle

**Initialize state from URL parameters BEFORE calling hooks that depend on that state.**

This ensures:
- No unnecessary fetches from wrong sources
- No flash of incorrect data
- Better user experience
- Cleaner code (no sync logic needed)

## 🧪 Testing

1. Click "View in Timetable" from a notification
2. Check browser console
3. Verify only ONE fetch from `data_vme_test`
4. Verify course shows with correct seat count (0 if full)
5. Verify red badge appears immediately (not orange first)
