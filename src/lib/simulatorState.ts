import { createServerClient } from './supabase'

const TEST_TABLE = 'data_vme_test'
const SOURCE_TABLE = 'data_vme'

// Track courses that have been logged as full to avoid spam
const loggedFullCourses = new Set<string>()

interface SimulatorState {
  isRunning: boolean
  sessionId: string | null
  abortFlag: boolean  // New: explicit abort flag for async operations
  stats: {
    registeredStudents: number
    totalRegistrations: number
    failedRegistrations: number
    startTime: string | null
    elapsedTime: number
  }
  config: {
    totalStudents: number
    coursesPerStudent: number
    studentsPerMinute: number
  }
  logs: string[]
  activeStudents: Set<number>
}

// Use global to persist across hot reloads in dev mode
declare global {
  var __simulatorState: SimulatorState | undefined
  var __simulationTimeout: NodeJS.Timeout | null | undefined
  var __studentTimeouts: Map<number, NodeJS.Timeout> | undefined
  var __simulatorAbortController: AbortController | undefined
}

// In-memory state (persists as long as server is running)
const defaultState: SimulatorState = {
  isRunning: false,
  sessionId: null,
  abortFlag: false,
  stats: {
    registeredStudents: 0,
    totalRegistrations: 0,
    failedRegistrations: 0,
    startTime: null,
    elapsedTime: 0,
  },
  config: {
    totalStudents: 100,
    coursesPerStudent: 5,
    studentsPerMinute: 20,
  },
  logs: [],
  activeStudents: new Set(),
}

// Initialize or get existing state
if (!global.__simulatorState) {
  global.__simulatorState = { ...defaultState, activeStudents: new Set() }
}
if (global.__simulationTimeout === undefined) {
  global.__simulationTimeout = null
}
if (global.__studentTimeouts === undefined) {
  global.__studentTimeouts = new Map()
}
if (global.__simulatorAbortController === undefined) {
  global.__simulatorAbortController = new AbortController()
}

const simulatorState = global.__simulatorState

export function getSimulatorState() {
  // Update elapsed time if running
  if (simulatorState.isRunning && simulatorState.stats.startTime) {
    const start = new Date(simulatorState.stats.startTime).getTime()
    simulatorState.stats.elapsedTime = Math.floor((Date.now() - start) / 1000)
  }
  return { 
    isRunning: simulatorState.isRunning,
    sessionId: simulatorState.sessionId,
    stats: { ...simulatorState.stats },
    config: { ...simulatorState.config },
    logs: [...simulatorState.logs],
  }
}

export function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString()
  simulatorState.logs = [`[${timestamp}] ${message}`, ...simulatorState.logs.slice(0, 99)]
}

// Log when a course becomes full (notifications are read directly from data_vme_test)
function logCourseFull(courseData: any) {
  const courseKey = `${courseData['Course Code']}-${courseData['Section']}`
  if (!loggedFullCourses.has(courseKey)) {
    loggedFullCourses.add(courseKey)
    addLog(`🔔 FULL: ${courseData['Course Code']}-${courseData['Section']} (${courseData['Seat Limit']} seats)`)
  }
}

export async function startSimulator(config: SimulatorState['config']): Promise<string> {
  // If already running, force stop first and wait a bit for cleanup
  if (simulatorState.isRunning) {
    forceStopSimulator()
    // Small delay to ensure cleanup completes
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  const sessionId = `sim_${Date.now()}`
  
  // Create new abort controller for this session
  global.__simulatorAbortController = new AbortController()
  
  // Reset state
  simulatorState.isRunning = true
  simulatorState.abortFlag = false
  simulatorState.sessionId = sessionId
  simulatorState.stats = {
    registeredStudents: 0,
    totalRegistrations: 0,
    failedRegistrations: 0,
    startTime: new Date().toISOString(),
    elapsedTime: 0,
  }
  simulatorState.config = config
  simulatorState.logs = []
  simulatorState.activeStudents = new Set()

  addLog(`🚀 Starting parallel simulation: ${config.totalStudents} students, ${config.coursesPerStudent} courses each, ${config.studentsPerMinute} students/min`)

  // Store current session ID to check if we're still the active session
  const currentSessionId = sessionId
  
  // Schedule all students with distributed start times
  for (let i = 1; i <= config.totalStudents; i++) {
    // Calculate when this student should start registering
    // Add some randomness for realistic distribution (±20% variance)
    const baseDelay = ((i - 1) / config.studentsPerMinute) * 60 * 1000
    const variance = (Math.random() - 0.5) * 0.4 * (60000 / config.studentsPerMinute)
    const startDelay = Math.max(0, baseDelay + variance)
    
    const timeout = setTimeout(() => {
      // Check both isRunning AND that we're still the same session
      // This prevents old session timeouts from firing after restart
      if (simulatorState.isRunning && 
          !simulatorState.abortFlag && 
          simulatorState.sessionId === currentSessionId) {
        registerStudentParallel(i, currentSessionId)
      }
    }, startDelay)
    
    global.__studentTimeouts?.set(i, timeout)
  }

  return sessionId
}

// Register a single student - all their courses in parallel
async function registerStudentParallel(studentNum: number, expectedSessionId: string) {
  // Triple check: isRunning, abortFlag, and session match
  if (!simulatorState.isRunning || 
      simulatorState.abortFlag || 
      simulatorState.sessionId !== expectedSessionId) {
    return
  }
  
  simulatorState.activeStudents.add(studentNum)
  
  try {
    const supabase = createServerClient()

    // Get available courses
    const { data: courses } = await supabase
      .from(TEST_TABLE)
      .select('*')
      .gt('Seat Left', 0)

    if (!courses || courses.length === 0) {
      addLog(`⚠️ No available seats for Student #${studentNum}`)
      simulatorState.stats.registeredStudents++
      simulatorState.stats.failedRegistrations += simulatorState.config.coursesPerStudent
      checkCompletion()
      return
    }

    // Randomly select courses
    const numCourses = Math.min(simulatorState.config.coursesPerStudent, courses.length)
    const shuffled = [...courses].sort(() => Math.random() - 0.5)
    const selectedCourses = shuffled.slice(0, numCourses)

    // Register all courses in parallel with small random delays for realism
    const registrationPromises = selectedCourses.map((course, idx) => {
      // Small random delay between course registrations (0-500ms)
      const delay = Math.random() * 500
      return new Promise<{ success: boolean; course: any }>(resolve => {
        const timeoutId = setTimeout(async () => {
          // Check abort flag before each operation
          if (!simulatorState.isRunning || 
              simulatorState.abortFlag || 
              simulatorState.sessionId !== expectedSessionId) {
            resolve({ success: false, course })
            return
          }
          
          try {
            // Use atomic update with RPC or optimistic update
            const { data: currentData, error: fetchError } = await supabase
              .from(TEST_TABLE)
              .select('*')
              .eq('Course Code', course['Course Code'])
              .eq('Section', course['Section'])
              .single()

            // Check abort again after async operation
            if (simulatorState.abortFlag || simulatorState.sessionId !== expectedSessionId) {
              resolve({ success: false, course })
              return
            }

            if (fetchError || !currentData || currentData['Seat Left'] <= 0) {
              resolve({ success: false, course })
              return
            }

            const newSeatLeft = currentData['Seat Left'] - 1
            const { error } = await supabase
              .from(TEST_TABLE)
              .update({
                'Seat Used': currentData['Seat Used'] + 1,
                'Seat Left': newSeatLeft,
              })
              .eq('Course Code', course['Course Code'])
              .eq('Section', course['Section'])
              .eq('Seat Left', currentData['Seat Left']) // Optimistic lock

            // Log when course becomes full (notifications read from data_vme_test directly)
            if (!error && newSeatLeft === 0) {
              logCourseFull(currentData)
            }

            resolve({ success: !error, course })
          } catch {
            resolve({ success: false, course })
          }
        }, delay)
      })
    })

    const results = await Promise.all(registrationPromises)
    
    let successCount = 0
    let failedCount = 0
    
    for (const result of results) {
      if (result.success) {
        successCount++
        // Only log some registrations to avoid spam
        if (studentNum <= 10 || studentNum % 10 === 0) {
          addLog(`✅ Student #${studentNum} → ${result.course['Course Code']}-${result.course['Section']}`)
        }
      } else {
        failedCount++
      }
    }

    // Update stats atomically
    simulatorState.stats.registeredStudents++
    simulatorState.stats.totalRegistrations += successCount
    simulatorState.stats.failedRegistrations += failedCount
    
    // Log summary for this student
    if (studentNum <= 10 || studentNum % 10 === 0) {
      addLog(`📊 Student #${studentNum} completed: ${successCount}/${numCourses} courses`)
    }
    
  } catch (error) {
    simulatorState.stats.registeredStudents++
    simulatorState.stats.failedRegistrations += simulatorState.config.coursesPerStudent
    addLog(`❌ Error registering Student #${studentNum}`)
  } finally {
    simulatorState.activeStudents.delete(studentNum)
    global.__studentTimeouts?.delete(studentNum)
    checkCompletion()
  }
}

function checkCompletion() {
  // Don't mark as complete if we've been aborted
  if (simulatorState.abortFlag) return
  
  if (simulatorState.stats.registeredStudents >= simulatorState.config.totalStudents) {
    addLog(`🎉 Simulation completed! ${simulatorState.stats.totalRegistrations} total registrations`)
    simulatorState.isRunning = false
  }
}

// Internal force stop - clears everything without logging
function forceStopSimulator() {
  // Set abort flag FIRST to stop all async operations
  simulatorState.abortFlag = true
  simulatorState.isRunning = false
  
  // Abort any pending fetch operations
  if (global.__simulatorAbortController) {
    global.__simulatorAbortController.abort()
    global.__simulatorAbortController = new AbortController()
  }
  
  // Clear all pending student timeouts
  if (global.__studentTimeouts) {
    global.__studentTimeouts.forEach((timeout) => clearTimeout(timeout))
    global.__studentTimeouts.clear()
  }
  
  simulatorState.activeStudents.clear()
}

export function stopSimulator() {
  // Set abort flag FIRST to stop all async operations immediately
  simulatorState.abortFlag = true
  simulatorState.isRunning = false
  
  // Abort any pending fetch operations
  if (global.__simulatorAbortController) {
    global.__simulatorAbortController.abort()
    global.__simulatorAbortController = new AbortController()
  }
  
  // Clear all pending student timeouts
  if (global.__studentTimeouts) {
    global.__studentTimeouts.forEach((timeout) => clearTimeout(timeout))
    global.__studentTimeouts.clear()
  }
  
  simulatorState.activeStudents.clear()
  addLog('⏹️ Simulation stopped')
}

export function killSimulator() {
  // Set abort flag FIRST - this is critical
  simulatorState.abortFlag = true
  simulatorState.isRunning = false
  
  // Abort any pending fetch operations
  if (global.__simulatorAbortController) {
    global.__simulatorAbortController.abort()
    global.__simulatorAbortController = new AbortController()
  }
  
  // Clear all pending student timeouts
  if (global.__studentTimeouts) {
    global.__studentTimeouts.forEach((timeout) => clearTimeout(timeout))
    global.__studentTimeouts.clear()
  }
  
  // Reset everything to defaults
  simulatorState.sessionId = null
  simulatorState.stats = {
    registeredStudents: 0,
    totalRegistrations: 0,
    failedRegistrations: 0,
    startTime: null,
    elapsedTime: 0,
  }
  simulatorState.logs = []
  simulatorState.activeStudents.clear()
  
  // Log AFTER reset so it shows in fresh logs
  addLog('🔴 Process killed and reset')
  
  // Reset abort flag after everything is cleared
  // This allows new simulations to start
  simulatorState.abortFlag = false
}

export async function resetSimulator() {
  stopSimulator()
  
  const supabase = createServerClient()

  // Copy data from source to test table
  const { data: sourceData, error: fetchError } = await supabase
    .from(SOURCE_TABLE)
    .select('*')

  if (fetchError || !sourceData) {
    addLog(`❌ Error fetching source data: ${fetchError?.message}`)
    return false
  }

  // Clear test table
  await supabase.from(TEST_TABLE).delete().neq('Course Code', '')

  // Insert fresh data
  const { error: insertError } = await supabase
    .from(TEST_TABLE)
    .insert(sourceData.map(row => ({ ...row })))

  if (insertError) {
    addLog(`❌ Error resetting database: ${insertError.message}`)
    return false
  }

  simulatorState.stats = {
    registeredStudents: 0,
    totalRegistrations: 0,
    failedRegistrations: 0,
    startTime: null,
    elapsedTime: 0,
  }
  
  addLog(`🔄 Database reset - ${sourceData.length} courses restored`)
  return true
}
