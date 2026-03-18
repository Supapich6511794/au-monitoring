# Supabase Realtime Channel Error Fix

## 🐞 Error

```
[Simulator] ❌ Channel error: undefined
```

This error occurs when the Supabase realtime subscription fails to connect to the `data_vme_test` table.

## 🔍 Root Causes

### 1. **Realtime Not Enabled on Table**
The most common cause - Supabase realtime must be explicitly enabled for each table.

### 2. **RLS (Row Level Security) Policies**
Even if realtime is enabled, RLS policies can block realtime subscriptions.

### 3. **Network/Connection Issues**
Temporary network issues or Supabase service disruptions.

### 4. **Missing Realtime Configuration**
Incorrect Supabase client configuration.

## ✅ Solutions

### Solution 1: Enable Realtime on Table (Most Likely Fix)

**In Supabase Dashboard:**

1. Go to **Database** → **Replication**
2. Find the `data_vme_test` table
3. Click the toggle to **enable realtime**
4. Also enable for `data_vme` table if needed

**Via SQL:**
```sql
-- Enable realtime for data_vme_test
ALTER PUBLICATION supabase_realtime ADD TABLE data_vme_test;

-- Enable realtime for data_vme
ALTER PUBLICATION supabase_realtime ADD TABLE data_vme;
```

### Solution 2: Fix RLS Policies

**Check if RLS is blocking:**
```sql
-- Check current RLS policies
SELECT * FROM pg_policies WHERE tablename = 'data_vme_test';
```

**Option A: Disable RLS (for testing only)**
```sql
ALTER TABLE data_vme_test DISABLE ROW LEVEL SECURITY;
ALTER TABLE data_vme DISABLE ROW LEVEL SECURITY;
```

**Option B: Add policy to allow realtime (recommended)**
```sql
-- Allow authenticated users to SELECT (required for realtime)
CREATE POLICY "Allow authenticated users to read" 
ON data_vme_test 
FOR SELECT 
TO authenticated 
USING (true);

-- Same for data_vme
CREATE POLICY "Allow authenticated users to read" 
ON data_vme 
FOR SELECT 
TO authenticated 
USING (true);
```

### Solution 3: Enhanced Error Handling (Already Implemented)

The code now includes better error handling:

```typescript
.subscribe((status, err) => {
  console.log('[Simulator] Subscription status:', status);
  if (status === 'SUBSCRIBED') {
    console.log('[Simulator] ✅ Successfully subscribed to realtime');
  } else if (status === 'CHANNEL_ERROR') {
    console.error('[Simulator] ❌ Channel error:', err);
    console.error('[Simulator] Error details:', {
      message: err?.message,
      code: err?.code,
      details: err?.details
    });
    console.warn('[Simulator] ⚠️ Falling back to polling mode');
  } else if (status === 'TIMED_OUT') {
    console.warn('[Simulator] ⚠️ Realtime subscription timed out');
  } else if (status === 'CLOSED') {
    console.log('[Simulator] Realtime subscription closed');
  }
});
```

### Solution 4: Verify Supabase Configuration

**Check `.env.local` file:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Verify client configuration in `src/lib/supabase.ts`:**
```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
})
```

## 🧪 Testing Steps

### 1. Check Realtime Status in Console

After implementing the fix, check the browser console:

**Success:**
```
[Simulator] Setting up realtime subscription for: data_vme_test
[Simulator] Subscription status: SUBSCRIBED
[Simulator] ✅ Successfully subscribed to realtime
```

**Still Failing:**
```
[Simulator] Subscription status: CHANNEL_ERROR
[Simulator] ❌ Channel error: [error object]
[Simulator] Error details: { message: "...", code: "...", details: "..." }
[Simulator] ⚠️ Falling back to polling mode
```

### 2. Test Realtime Updates

1. Open the Registration Simulator page
2. Check console for subscription status
3. In Supabase Dashboard, manually update a row in `data_vme_test`
4. Verify the change appears in the simulator without refresh

### 3. Verify Table Configuration

**In Supabase Dashboard:**
- Database → Tables → `data_vme_test`
- Check "Realtime" is enabled
- Check RLS policies allow SELECT

## 📊 Impact

### With Realtime Working:
✅ Instant updates when seat counts change  
✅ Live synchronization across all connected clients  
✅ Better user experience  
✅ Lower server load (no polling)  

### With Realtime Failing (Fallback Mode):
⚠️ Still works, but updates may be delayed  
⚠️ Relies on periodic polling instead  
⚠️ Slightly higher server load  
⚠️ No real-time synchronization  

## 🔧 Quick Fix Checklist

- [ ] Enable realtime on `data_vme_test` table in Supabase Dashboard
- [ ] Enable realtime on `data_vme` table in Supabase Dashboard
- [ ] Check RLS policies allow SELECT for authenticated users
- [ ] Verify `.env.local` has correct Supabase credentials
- [ ] Test subscription status in browser console
- [ ] Manually update a row to verify realtime updates work

## 🚨 Common Mistakes

### ❌ Don't: Disable RLS in Production
```sql
-- NEVER do this in production
ALTER TABLE data_vme_test DISABLE ROW LEVEL SECURITY;
```

### ✅ Do: Use Proper RLS Policies
```sql
-- Use specific policies instead
CREATE POLICY "Allow authenticated users to read" 
ON data_vme_test FOR SELECT TO authenticated USING (true);
```

### ❌ Don't: Ignore Error Details
The error object contains valuable debugging information - always log it.

### ✅ Do: Log Complete Error Details
```typescript
console.error('[Simulator] Error details:', {
  message: err?.message,
  code: err?.code,
  details: err?.details
});
```

## 📝 Files Modified

- `src/app/registration-simulator/page.tsx` - Enhanced error handling and logging
- `SUPABASE_REALTIME_FIX.md` - This documentation

## 🔗 Resources

- [Supabase Realtime Documentation](https://supabase.com/docs/guides/realtime)
- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast)

## 💡 Next Steps

1. **Check Supabase Dashboard** - Verify realtime is enabled on tables
2. **Review Console Logs** - Check the detailed error information
3. **Test Connection** - Manually update a row to verify realtime works
4. **Contact Support** - If issue persists, contact Supabase support with error details

The simulator will continue to work even if realtime fails, but updates will be less immediate.
