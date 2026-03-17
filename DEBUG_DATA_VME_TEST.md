# Debugging data_vme_test Display Issue

## 🐞 Problem

When clicking "View in Timetable" from a notification, the system shows an empty state instead of displaying the course from the `data_vme_test` table.

## 🔍 Debugging Steps Added

I've added comprehensive logging to track the data flow and identify where the issue occurs.

### 1. Database Mode Tracking

```typescript
useEffect(() => {
  console.log('[CourseGrid] Database mode:', databaseMode)
  console.log('[CourseGrid] Total courses loaded:', allCourses.length)
  console.log('[CourseGrid] URL params:', { urlCourse, urlSection, urlDb, urlAutoOpen })
}, [databaseMode, allCourses.length, urlCourse, urlSection, urlDb, urlAutoOpen])
```

**What to check in console:**
- Is `databaseMode` set to `'test'` when navigating from notification?
- How many courses are loaded? (Should be > 0 if data exists)
- Are URL params correct? (`urlDb: 'test'`, `urlCourse: 'CSX4609'`, etc.)

### 2. Course Filtering Logging

```typescript
console.log('[filteredCoursesByDay] Filtering for:', urlCourse, 'section:', urlSection)
console.log('[filteredCoursesByDay] Available courses in coursesByDay:', 
  Object.values(coursesByDay).flatMap(groups => 
    groups.flatMap(g => g.courses.map(c => `${c.courseCode}-${c.section} (seats: ${c.seatLeft})`))
  )
)
```

**What to check in console:**
- What courses are available in `coursesByDay`?
- Does the course you're looking for exist in the list?
- Is the course code format correct? (e.g., `CSX4609` vs `CSX 4609`)
- Is the section number correct? (e.g., `'541'` vs `541`)

### 3. Match Detection

```typescript
if (codeMatch && sectionMatch) {
  console.log('[filteredCoursesByDay] ✅ Found match:', c.courseCode, c.section, 'seats:', c.seatLeft)
}
```

**What to check in console:**
- Do you see "✅ Found match" logs?
- If yes: Course exists and filtering works
- If no: Course doesn't exist or filter criteria don't match

## 🎯 Common Issues and Solutions

### Issue 1: Database Mode Not Set to 'test'

**Symptoms:**
```
[CourseGrid] Database mode: default
[CourseGrid] URL params: { urlDb: 'test', ... }
```

**Cause:** Database initialization logic not working

**Solution:** Check `hasInitializedDB` ref and `userChangedDB` state

---

### Issue 2: No Courses Loaded

**Symptoms:**
```
[CourseGrid] Total courses loaded: 0
```

**Cause:** 
- API not fetching from `data_vme_test`
- Table is empty
- API error

**Solution:** 
1. Check browser Network tab for `/api/courses?table=data_vme_test` request
2. Verify response has data
3. Check `data_vme_test` table in Supabase has courses

---

### Issue 3: Course Code Mismatch

**Symptoms:**
```
[filteredCoursesByDay] Filtering for: CSX4609 section: 541
[filteredCoursesByDay] Available courses: ['CSX 4609-541', ...]
```

**Cause:** Course code has a space in database but not in URL

**Solution:** Update filtering logic to handle spaces:
```typescript
const normalizedUrlCourse = urlCourse.replace(/\s+/g, '')
const normalizedDbCourse = c.courseCode.replace(/\s+/g, '')
const codeMatch = normalizedDbCourse.toLowerCase() === normalizedUrlCourse.toLowerCase()
```

---

### Issue 4: Section Type Mismatch

**Symptoms:**
```
[filteredCoursesByDay] Filtering for: CSX4609 section: 541
[filteredCoursesByDay] Available courses: ['CSX4609-"541"', ...]
```

**Cause:** Section is string in URL but number in database (or vice versa)

**Solution:** Convert both to strings for comparison:
```typescript
const sectionMatch = String(c.section) === String(urlSection)
```

---

### Issue 5: Data Not Loaded Yet

**Symptoms:**
```
[filteredCoursesByDay] Available courses: []
[CourseGrid] Total courses loaded: 0
```

**Cause:** Filtering runs before data is fetched

**Solution:** Already handled - filtering skips when `isLoading` is true

---

## 📊 Expected Console Output (Success)

```
[CourseGrid] Database mode: test
[CourseGrid] Total courses loaded: 150
[CourseGrid] URL params: { 
  urlCourse: 'CSX4609', 
  urlSection: '541', 
  urlDb: 'test', 
  urlAutoOpen: 'true' 
}

[filteredCoursesByDay] Filtering for: CSX4609 section: 541
[filteredCoursesByDay] Available courses: [
  'CSX4609-541 (seats: 0)',
  'AE3411-542 (seats: 3)',
  ...
]
[filteredCoursesByDay] ✅ Found match: CSX4609 541 seats: 0
[filteredCoursesByDay] Filtered result days: ['THU']
```

---

## 🔧 Next Steps

1. **Open browser console** (F12)
2. **Click "View in Timetable"** from a notification
3. **Check the console logs** for the patterns above
4. **Identify which issue** matches your console output
5. **Report back** with the console logs

### Key Questions to Answer:

1. What is `databaseMode` when you navigate? (`'default'` or `'test'`)
2. How many courses are loaded? (`0` or `> 0`)
3. What courses appear in "Available courses" list?
4. Do you see "✅ Found match" logs?
5. What appears in "Filtered result days"?

---

## 🛠️ Temporary Workaround

If you need to test immediately, you can temporarily remove the section filter:

```typescript
// Temporary: Show all sections of the course
const sectionMatch = true // urlSection ? c.section === urlSection : true
```

This will show all sections of the course, helping verify if the issue is:
- Course code matching ✓
- Section matching ✗

---

## 📝 Files Modified for Debugging

- `src/components/CourseGrid.tsx` - Added comprehensive logging
- `DEBUG_DATA_VME_TEST.md` - This debugging guide

Once we see the console logs, we can identify the exact issue and apply the appropriate fix.
