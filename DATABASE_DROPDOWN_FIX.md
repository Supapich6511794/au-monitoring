# Database Dropdown Fix - Preventing URL Override

## 🐞 Problem

The database dropdown was stuck on "test" and couldn't be changed by users:

1. User navigates from "View in Timetable" → database correctly set to "test"
2. User tries to change to "default" → immediately switches back to "test"
3. Dropdown becomes unusable

## 🎯 Root Cause

The database sync `useEffect` was running **on every render** and continuously overriding user selections:

```typescript
// ❌ BAD: Runs every time urlDb or databaseMode changes
useEffect(() => {
  if (urlDb && urlDb !== databaseMode) {
    setDatabaseMode(urlDb as DatabaseMode)
  }
}, [urlDb, databaseMode, setDatabaseMode])
```

**Why this caused the bug:**
- When user changes dropdown → `databaseMode` changes
- `databaseMode` is in dependency array → effect re-runs
- Effect sees `urlDb` still = "test" → sets database back to "test"
- Infinite override loop

## ✅ Solution Implemented

### 1. Added Initialization Tracking

```typescript
// Track if database has been initialized from URL
const hasInitializedDB = useRef(false)

// Track if user manually changed database
const [userChangedDB, setUserChangedDB] = useState(false)
```

### 2. One-Time Database Initialization

```typescript
// FIX: One-time database initialization from URL (never override user changes)
useEffect(() => {
  // Only sync database from URL on first load
  if (!hasInitializedDB.current && !userChangedDB) {
    if (urlDb && urlDb !== databaseMode) {
      console.log('[CourseGrid] Initial database sync from URL:', urlDb)
      setDatabaseMode(urlDb as DatabaseMode)
    }
    hasInitializedDB.current = true
  }
}, [urlDb, databaseMode, setDatabaseMode, userChangedDB])
```

**How it works:**
- `hasInitializedDB.current` prevents running after first load
- `!userChangedDB` ensures we don't override user selections
- Only runs **once** when component mounts

### 3. Updated Dropdown Handler

```typescript
<select
  value={databaseMode}
  onChange={(e) => {
    // Mark that user manually changed database - prevents URL override
    setUserChangedDB(true)
    setDatabaseMode(e.target.value as DatabaseMode)
    console.log('[CourseGrid] User changed database to:', e.target.value)
  }}
>
  <option value="default">Database: Default</option>
  <option value="test">Database: Test</option>
</select>
```

**How it works:**
- Sets `userChangedDB = true` on first manual change
- Once set, the initialization effect never runs again
- User has full control over database selection

## 🔄 Flow Diagram

### Before Fix (Broken)
```
User clicks "View in Timetable"
  ↓
URL: ?db=test
  ↓
useEffect runs → setDatabaseMode('test')
  ↓
User changes dropdown to 'default'
  ↓
databaseMode changes → useEffect re-runs
  ↓
Effect sees urlDb='test' → setDatabaseMode('test') ❌
  ↓
Stuck on 'test' forever
```

### After Fix (Working)
```
User clicks "View in Timetable"
  ↓
URL: ?db=test
  ↓
useEffect runs (hasInitializedDB=false, userChangedDB=false)
  ↓
setDatabaseMode('test')
  ↓
hasInitializedDB.current = true ✅
  ↓
User changes dropdown to 'default'
  ↓
setUserChangedDB(true) ✅
setDatabaseMode('default')
  ↓
useEffect sees userChangedDB=true → SKIPS ✅
  ↓
Database stays on 'default' - user has control
```

## 📊 Test Scenarios

### Scenario 1: Initial Navigation from Notification
1. Click "View in Timetable" for course AE3411
2. **Expected:** Database auto-selects "test" ✅
3. **Expected:** Course appears in timetable ✅

### Scenario 2: User Changes Database
1. After initial load with db=test
2. User changes dropdown to "default"
3. **Expected:** Database switches to "default" ✅
4. **Expected:** Stays on "default" (no auto-revert) ✅

### Scenario 3: Multiple Manual Changes
1. User changes: test → default
2. User changes: default → test
3. User changes: test → default
4. **Expected:** All changes work smoothly ✅
5. **Expected:** No URL override ✅

### Scenario 4: Direct URL Navigation
1. User navigates to `/course-monitoring?db=test`
2. **Expected:** Database initializes to "test" ✅
3. User changes to "default"
4. **Expected:** Stays on "default" ✅

## 🔑 Key Principles Applied

### 1. **One-Time Initialization**
- URL params applied **only once** on mount
- Uses `useRef` to track initialization state
- Prevents repeated syncing

### 2. **User Intent Preservation**
- Track user interactions with `userChangedDB` state
- Once user changes database, URL never overrides again
- User has full control after first interaction

### 3. **Clean Separation of Concerns**
```typescript
// Initialization (runs once)
useEffect(() => {
  if (!hasInitializedDB.current && !userChangedDB) {
    // Apply URL params
  }
}, [...])

// User interaction (sets flag)
onChange={(e) => {
  setUserChangedDB(true)
  setDatabaseMode(e.target.value)
}}
```

## 🚫 Anti-Patterns Avoided

### ❌ Don't: Sync on every render
```typescript
// BAD: Runs continuously
useEffect(() => {
  if (urlDb) setDatabaseMode(urlDb)
}, [urlDb, databaseMode])
```

### ❌ Don't: Force database in render
```typescript
// BAD: Causes infinite loops
if (urlDb === 'test') {
  setDatabaseMode('test')
}
```

### ❌ Don't: Ignore user intent
```typescript
// BAD: Always overrides user
useEffect(() => {
  setDatabaseMode(urlDb || 'default')
}, [urlDb])
```

### ✅ Do: One-time initialization with user override protection
```typescript
// GOOD: Respects user intent
useEffect(() => {
  if (!hasInitialized && !userChanged) {
    // Initialize once
  }
}, [...])
```

## 📝 Files Modified

**`src/components/CourseGrid.tsx`**
- Added `hasInitializedDB` ref
- Added `userChangedDB` state
- Updated database sync useEffect
- Updated dropdown onChange handler

## 🎯 Result

✅ Database initializes from URL on first load  
✅ User can freely change database after load  
✅ No automatic revert to URL value  
✅ Dropdown is fully functional  
✅ User has complete control  

## 🔮 Future Considerations

1. **Reset on Navigation:** If user navigates to a new course, should we reset `userChangedDB`?
   - Current: Once set, stays set for entire session
   - Alternative: Reset when URL params change significantly

2. **URL Sync:** Should user's database selection update the URL?
   - Current: URL stays as initial value
   - Alternative: Update URL when user changes database

3. **Persistence:** Should database selection persist across sessions?
   - Current: Resets on page refresh
   - Alternative: Store in localStorage
