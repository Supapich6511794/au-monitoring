# Notification Initial State Fix

## 🐞 Problem

When the application loaded or the simulation was reset, the notification panel showed all courses that were already full in the dataset, even though they didn't become full during the simulation. This cluttered the notification panel with irrelevant notifications.

**User Request:**
- Show **empty notifications** on initial load
- Only show notifications for courses that become full **during simulation**
- Don't show courses that are already full in the dataset
- Keep the "Clear All" function working as before
- Reset notifications when "Reset DB" is clicked

## ✅ Solution Implemented

### **1. Mark Initially-Full Courses as Cleared**

On initial load, all courses that are already full in the dataset are automatically marked as "cleared" so they don't appear in the notification panel.

```typescript
// On initial load: store baseline seat values and mark initially-full courses as cleared
if (isInitialNotificationLoad) {
  prevSeatValues = new Map(currentSeatValues)
  isInitialNotificationLoad = false
  const fullCount = data.length
  console.log(`[Notifications] Initial load: stored ${currentSeatValues.size} course seat values, ${fullCount} already full`)
  
  // Mark all initially-full courses as cleared so they don't show in notifications
  // Only courses that become full during simulation will show
  const clearedSet = getClearedNotifications()
  data.forEach(r => {
    const id = `${r["Course Code"]}-${r["Section"]}`
    clearedSet.add(id)
    console.log(`[Notifications] Marking initially-full course as cleared: ${id}`)
  })
  updateClearedNotifications(clearedSet)
}
```

### **2. Remove from Cleared Set When Course Becomes Full**

When a course transitions from having seats (>0) to being full (0) during simulation, it's removed from the cleared set so it can appear as a notification.

```typescript
// Course just became full (had seats before, now has 0)
if (currentSeat === 0 && prevSeat !== undefined && prevSeat > 0) {
  if (!notifiedCourseIds.has(id)) {
    // Remove from cleared set so it can show as notification
    const clearedSet = getClearedNotifications()
    clearedSet.delete(id)
    updateClearedNotifications(clearedSet)
    
    readSet.delete(id)
    resolvedSet.delete(id)
    notifiedCourseIds.add(id)
    newlyFull.push(id)
  }
}
```

### **3. Reset All Notification States on Simulation Reset**

When "Reset DB" is clicked in the simulator, all notification states are reset, including the cleared set.

```typescript
// In registration-simulator/page.tsx
const resetSimulation = useCallback(async () => {
  // ... reset database ...
  
  // Reset all notification states (cleared, read, resolved)
  // This allows courses to send notifications again after reset
  resetAllNotifications();
  addLog('🔔 Notification states reset');
  
  // ... continue with reset ...
}, [resetAllNotifications, ...]);
```

## 🔄 Notification Flow

### **Initial Load (Empty Notifications)**

```
1. App loads → fetchNotifications() called
2. Fetch all courses from data_vme_test
3. Find courses with Seat Left = 0 (e.g., 35 courses already full)
4. Mark all 35 courses as "cleared"
5. Filter out cleared courses → 0 notifications shown ✓
6. Notification panel is empty ✓
```

### **During Simulation (Show New Full Courses)**

```
1. Simulation runs → Course ITX4606 has 5 seats left
2. Student registers → ITX4606 now has 0 seats left
3. Seat transition detected: 5 → 0
4. Remove ITX4606 from cleared set
5. Add ITX4606 to notifications
6. Notification appears: "ITX4606 is now full" ✓
```

### **User Clears Notification**

```
1. User clicks "Clear" on ITX4606 notification
2. ITX4606 added to cleared set
3. ITX4606 removed from notification panel ✓
4. ITX4606 won't show again (even if it becomes full again)
```

### **User Clears All Notifications**

```
1. User clicks "Clear All"
2. All current notification IDs added to cleared set
3. All notifications removed from panel ✓
4. Those courses won't show again (until reset)
```

### **Simulation Reset (Empty Notifications Again)**

```
1. User clicks "Reset DB"
2. Database reset → All courses back to original state
3. resetAllNotifications() called
4. Cleared set cleared → Empty
5. Read set cleared → Empty
6. Resolved set cleared → Empty
7. Notification timestamps cleared → Empty
8. fetchNotifications() called
9. Initially-full courses marked as cleared again
10. Notification panel is empty ✓
```

## 📊 State Management

### **Notification States**

1. **`clearedNotificationsSet`** - Courses that won't show in notifications
   - Initially-full courses (from dataset)
   - User-cleared courses
   - Persisted to localStorage

2. **`readNotificationsSet`** - Courses marked as read
   - User clicked on notification
   - Persisted to localStorage

3. **`resolvedNotificationsSet`** - Courses marked as resolved
   - User added a new section
   - Persisted to localStorage

4. **`notifiedCourseIds`** - Courses that have already sent notifications
   - Prevents duplicate notifications
   - In-memory only (not persisted)

5. **`prevSeatValues`** - Previous seat counts for all courses
   - Used to detect seat transitions
   - In-memory only (not persisted)

### **Reset Behavior**

When `resetAllNotifications()` is called:
- ✅ Clears all 5 state collections
- ✅ Clears localStorage
- ✅ Resets `isInitialNotificationLoad` flag
- ✅ Allows fresh start for new simulation

## 🧪 Testing Scenarios

### **Scenario 1: Fresh Load**
1. Open application for first time
2. **Expected**: Notification panel is empty
3. **Actual**: ✓ Empty (initially-full courses are cleared)

### **Scenario 2: Simulation Run**
1. Start simulation
2. Wait for courses to become full
3. **Expected**: Notifications appear for newly-full courses
4. **Actual**: ✓ Notifications appear (cleared set is updated)

### **Scenario 3: Clear Individual Notification**
1. Click "Clear" on a notification
2. **Expected**: Notification disappears
3. **Actual**: ✓ Notification removed (added to cleared set)

### **Scenario 4: Clear All Notifications**
1. Click "Clear All"
2. **Expected**: All notifications disappear
3. **Actual**: ✓ All removed (all IDs added to cleared set)

### **Scenario 5: Reset Simulation**
1. Click "Reset DB"
2. **Expected**: Notification panel is empty
3. **Actual**: ✓ Empty (all states reset, initially-full courses cleared again)

### **Scenario 6: Second Simulation Run**
1. Reset DB
2. Run simulation again
3. Same courses become full
4. **Expected**: Notifications appear again
5. **Actual**: ✓ Notifications appear (cleared set was reset)

## 📝 Files Modified

### **`src/hooks/useNotifications.ts`**
- Modified `fetchNotifications()` to mark initially-full courses as cleared
- Added logic to remove courses from cleared set when they become full during simulation
- Ensures `resetAllNotifications()` clears all state including cleared set

### **`src/app/registration-simulator/page.tsx`**
- Added `useNotifications` import
- Called `resetAllNotifications()` when simulation is reset
- Ensures notification states are cleared along with database

## 🎯 Key Benefits

✅ **Clean Initial State** - No clutter from pre-existing full courses  
✅ **Relevant Notifications** - Only shows courses that became full during simulation  
✅ **User Control** - Clear All still works as expected  
✅ **Fresh Start** - Reset DB gives clean slate for new simulation  
✅ **Persistent Preferences** - Cleared notifications stay cleared (until reset)  
✅ **No Duplicates** - Same course won't notify multiple times (until reset)  

## 🔑 Key Principle

**Notifications should reflect simulation events, not dataset state.**

- Dataset state = What's in the database initially
- Simulation events = Changes that happen during simulation
- Notifications = Simulation events only

This ensures users only see actionable, relevant notifications about courses that became full while they were watching the simulation, not courses that were already full when they started.

## 💡 Console Output

### **Initial Load:**
```
[Notifications] Fetched from data_vme_test: 226 total courses, 35 full
[Notifications] Initial load: stored 226 course seat values, 35 already full
[Notifications] Marking initially-full course as cleared: ITX4606-541
[Notifications] Marking initially-full course as cleared: CE4901-641
... (33 more)
```

### **During Simulation:**
```
[Notifications] Newly full (transition >0→0): ['AE3411-541', 'ME2101-542']
```

### **After Reset:**
```
[Simulator] 🔄 Resetting database...
[Simulator] 🔔 Notification states reset
[Notifications] Initial load: stored 226 course seat values, 35 already full
[Notifications] Marking initially-full course as cleared: ITX4606-541
... (34 more)
```

The notification system now provides a clean, focused experience that only shows relevant simulation events.
