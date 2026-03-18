'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GCPLayout } from '@/components/GCPLayout';
import { RoleGuard } from '@/components/RoleGuard';
import { supabase } from '@/lib/supabase';
import { useNotifications } from '@/hooks/useNotifications';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Users, 
  Zap, 
  Clock, 
  BookOpen,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Settings,
  Database,
  Plus,
  Minus,
  Search,
  ChevronDown,
  Activity,
  BarChart3,
  Timer,
  XCircle
} from 'lucide-react';
import { AnimatedCounter, SeatCounter } from '@/components/AnimatedCounter';

// Test table name
const TEST_TABLE = 'data_vme_test';
const PROD_TABLE = 'data_vme';

interface CourseData {
  "Course ID": number;
  "Course Code": string;
  "Course Title": string;
  "Section": string;
  "Seat Limit": number;
  "Seat Used": number;
  "Seat Left": number;
}

interface SeatChange {
  courseKey: string;
  change: number;
  id: number;
}

interface SimulationConfig {
  mode: 'random' | 'manual';
  totalStudents: number;
  coursesPerStudent: number;
  studentsPerMinute: number;
}

interface SimulationStats {
  registeredStudents: number;
  totalRegistrations: number;
  failedRegistrations: number;
  startTime: Date | null;
  elapsedTime: number;
}

// LocalStorage keys
const STORAGE_KEYS = {
  config: 'simulator_config',
  stats: 'simulator_stats',
  logs: 'simulator_logs',
};

export default function RegistrationSimulatorPage() {
  // Notification hook for resetting cleared notifications
  const { resetAllNotifications } = useNotifications();
  
  // Data states
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [originalData, setOriginalData] = useState<CourseData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUsingTestData, setIsUsingTestData] = useState(false);
  
  // Simulation states
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [config, setConfig] = useState<SimulationConfig>({
    mode: 'random',
    totalStudents: 100,
    coursesPerStudent: 5,
    studentsPerMinute: 20,
  });
  const [stats, setStats] = useState<SimulationStats>({
    registeredStudents: 0,
    totalRegistrations: 0,
    failedRegistrations: 0,
    startTime: null,
    elapsedTime: 0,
  });
  const [logs, setLogs] = useState<string[]>([]);
  
  // Manual mode states
  const [manualCourseCode, setManualCourseCode] = useState('');
  const [manualSeats, setManualSeats] = useState(1);
  
  // Seat injection panel states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<CourseData | null>(null);
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [prevStats, setPrevStats] = useState({ totalSeats: 0, usedSeats: 0, availableSeats: 0 });
  
  // Course analytics state
  const [registrationHistory, setRegistrationHistory] = useState<{time: number, count: number}[]>([]);
  
  // Seat change animations
  const [seatChanges, setSeatChanges] = useState<SeatChange[]>([]);
  const changeIdRef = useRef(0);
  
  // Refs for simulation control
  const simulationRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load from localStorage after mount (fixes hydration)
  useEffect(() => {
    setHasMounted(true);
    try {
      const savedConfig = localStorage.getItem(STORAGE_KEYS.config);
      if (savedConfig) setConfig(JSON.parse(savedConfig));
      
      const savedStats = localStorage.getItem(STORAGE_KEYS.stats);
      if (savedStats) {
        const parsed = JSON.parse(savedStats);
        setStats({
          ...parsed,
          startTime: parsed.startTime ? new Date(parsed.startTime) : null,
        });
      }
      
      const savedLogs = localStorage.getItem(STORAGE_KEYS.logs);
      if (savedLogs) setLogs(JSON.parse(savedLogs));
    } catch (e) {
      // Ignore parse errors
    }
  }, []);

  // Save to localStorage when state changes (only after mount)
  useEffect(() => {
    if (hasMounted) localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(config));
  }, [config, hasMounted]);

  useEffect(() => {
    if (hasMounted) localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify({
      ...stats,
      startTime: stats.startTime?.toISOString() || null,
    }));
  }, [stats, hasMounted]);

  useEffect(() => {
    if (hasMounted) localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(logs));
  }, [logs, hasMounted]);

  // Timer for elapsed time - runs client-side only
  useEffect(() => {
    if (isSimulating && !isPaused && stats.startTime) {
      timerRef.current = setInterval(() => {
        setStats(prev => ({
          ...prev,
          elapsedTime: Math.floor((Date.now() - (prev.startTime?.getTime() || Date.now())) / 1000)
        }));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isSimulating, isPaused, stats.startTime]);

  // Add log entry
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 99)]);
  }, []);

  // Fetch courses from test table via API (bypasses schema cache)
  const fetchCourses = useCallback(async () => {
    setIsLoading(true);
    try {
      console.log('Fetching from table:', TEST_TABLE);
      
      // Use API route with service role key to bypass schema cache issues
      const response = await fetch(`/api/simulator/courses?table=${TEST_TABLE}`);
      const result = await response.json();

      console.log('Fetch result:', result);

      if (!response.ok || result.error) {
        console.error('API error:', result.error);
        addLog(`❌ Error: ${result.error}`);
        setCourses([]);
        setIsUsingTestData(false);
        return;
      }
      
      setCourses(result.data || []);
      console.log('Courses loaded:', result.data?.length || 0);
      
      // Store original data for reset
      if (originalData.length === 0 && result.data) {
        setOriginalData(JSON.parse(JSON.stringify(result.data)));
      }
      setIsUsingTestData(true);
      addLog(`✅ Loaded ${result.data?.length || 0} courses from test table`);
    } catch (error: any) {
      console.error('Error fetching courses:', error);
      addLog(`❌ Error fetching courses: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  }, [originalData.length, addLog]);

  // Initialize test table with data from production
  const initTestTable = useCallback(async () => {
    setIsLoading(true);
    addLog('🔄 Initializing test table from production data...');
    
    try {
      const response = await fetch('/api/simulator/init', { method: 'POST' });
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to initialize');
      }
      
      addLog(`✅ ${result.message}`);
      await fetchCourses();
    } catch (error: any) {
      console.error('Init error:', error);
      addLog(`❌ Init failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addLog, fetchCourses]);

  // Initial fetch on mount
  useEffect(() => {
    fetchCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to real-time updates (separate effect with empty deps)
  useEffect(() => {
    // Use unique channel name to avoid conflicts
    const channelName = `simulator-${Date.now()}`;
    console.log('[Simulator] Setting up realtime subscription for:', TEST_TABLE, 'channel:', channelName);
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { 
          event: '*',  // Listen to all events
          schema: 'public', 
          table: TEST_TABLE 
        },
        (payload) => {
          console.log('[Simulator] Realtime event received:', payload.eventType, payload);
          if (payload.eventType === 'UPDATE') {
            const newData = payload.new as CourseData;
            setCourses(prev => 
              prev.map(c => 
                c["Course Code"] === newData["Course Code"] && c["Section"] === newData["Section"]
                  ? newData
                  : c
              )
            );
          }
        }
      )
      .subscribe((status) => {
        console.log('[Simulator] Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[Simulator] ✅ Successfully subscribed to realtime');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Simulator] ❌ Channel error - Realtime subscription failed');
          console.error('[Simulator] Possible causes:');
          console.error('  1. Realtime not enabled on table "data_vme_test" in Supabase Dashboard');
          console.error('  2. RLS policies blocking realtime access');
          console.error('  3. Network connectivity issues');
          console.warn('[Simulator] ⚠️ Falling back to polling mode - realtime updates disabled');
        } else if (status === 'TIMED_OUT') {
          console.warn('[Simulator] ⚠️ Realtime subscription timed out');
        } else if (status === 'CLOSED') {
          console.log('[Simulator] Realtime subscription closed');
        }
      });

    return () => {
      console.log('[Simulator] Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, []);

  // Timer for elapsed time - REMOVED local timer to prevent conflict with server polling
  // The server sends elapsedTime in the status response, so we don't need a local timer
  // This prevents the "two timers" glitch where both local and server times were updating

  // Register a student to random courses
  const registerStudent = useCallback(async (studentNum: number) => {
    const availableCourses = courses.filter(c => c["Seat Left"] > 0);
    
    if (availableCourses.length === 0) {
      addLog(`⚠️ No available seats for Student #${studentNum}`);
      return { success: 0, failed: config.coursesPerStudent };
    }

    const numCourses = Math.min(config.coursesPerStudent, availableCourses.length);
    const selectedCourses: CourseData[] = [];
    const shuffled = [...availableCourses].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < numCourses && i < shuffled.length; i++) {
      selectedCourses.push(shuffled[i]);
    }

    let successCount = 0;
    let failedCount = 0;

    for (const course of selectedCourses) {
      if (abortRef.current) break;
      
      // Check current seat availability
      const { data: currentData } = await supabase
        .from(TEST_TABLE)
        .select('*')
        .eq('Course Code', course["Course Code"])
        .eq('Section', course["Section"])
        .single();

      if (!currentData || currentData["Seat Left"] <= 0) {
        failedCount++;
        continue;
      }

      // Update seat count
      const { error } = await supabase
        .from(TEST_TABLE)
        .update({
          "Seat Used": currentData["Seat Used"] + 1,
          "Seat Left": currentData["Seat Left"] - 1
        })
        .eq('Course Code', course["Course Code"])
        .eq('Section', course["Section"]);

      if (error) {
        failedCount++;
        addLog(`❌ Failed: Student #${studentNum} → ${course["Course Code"]}-${course["Section"]}`);
      } else {
        successCount++;
        addLog(`✅ Registered: Student #${studentNum} → ${course["Course Code"]}-${course["Section"]} (Seat Left: ${currentData["Seat Left"] - 1})`);
        
        // Add floating animation
        const courseKey = `${course["Course Code"]}-${course["Section"]}`;
        const changeId = ++changeIdRef.current;
        setSeatChanges(prev => [...prev, { courseKey, change: -1, id: changeId }]);
        setTimeout(() => {
          setSeatChanges(prev => prev.filter(c => c.id !== changeId));
        }, 1500);
      }
    }

    return { success: successCount, failed: failedCount };
  }, [courses, config.coursesPerStudent, addLog]);

  // Start simulation (client-side controlled)
  const startSimulation = useCallback(async () => {
    if (isSimulating && !isPaused) return;

    abortRef.current = false;
    setIsSimulating(true);
    setIsPaused(false);
    setStats({
      registeredStudents: 0,
      totalRegistrations: 0,
      failedRegistrations: 0,
      startTime: new Date(),
      elapsedTime: 0,
    });
    addLog(`🚀 Starting simulation: ${config.totalStudents} students, ${config.coursesPerStudent} courses each`);

    // Run simulation client-side
    const studentsPerSecond = config.studentsPerMinute / 60;
    const delayBetweenStudents = 1000 / studentsPerSecond;
    
    for (let i = 1; i <= config.totalStudents; i++) {
      if (abortRef.current) {
        addLog('⏹️ Simulation stopped');
        break;
      }

      // Register student
      const result = await registerStudent(i);
      
      setStats(prev => ({
        ...prev,
        registeredStudents: prev.registeredStudents + 1,
        totalRegistrations: prev.totalRegistrations + result.success,
        failedRegistrations: prev.failedRegistrations + result.failed,
      }));

      // Wait before next student
      if (i < config.totalStudents && !abortRef.current) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenStudents));
      }
    }

    if (!abortRef.current) {
      addLog(`🎉 Simulation completed!`);
    }
    setIsSimulating(false);
  }, [isSimulating, isPaused, config, addLog, registerStudent]);

  // Pause/Stop simulation (client-side)
  const pauseSimulation = useCallback(() => {
    abortRef.current = true;
    setIsPaused(true);
    setIsSimulating(false);
    addLog('⏹️ Simulation stopped');
  }, [addLog]);

  // Kill process and reset to defaults (client-side)
  const killAndReset = useCallback(() => {
    abortRef.current = true;
    setIsSimulating(false);
    setIsPaused(false);
    
    // Reset all local state
    setConfig({
      mode: 'random',
      totalStudents: 100,
      coursesPerStudent: 5,
      studentsPerMinute: 20,
    });
    setStats({
      registeredStudents: 0,
      totalRegistrations: 0,
      failedRegistrations: 0,
      startTime: null,
      elapsedTime: 0,
    });
    setRegistrationHistory([]);
    setLogs(['[' + new Date().toLocaleTimeString() + '] 🔴 Process killed and settings reset to defaults']);
    
    // Clear localStorage as well
    localStorage.removeItem(STORAGE_KEYS.stats);
    localStorage.removeItem(STORAGE_KEYS.logs);
    localStorage.removeItem(STORAGE_KEYS.config);
  }, []);

  // Reset simulation and database
  const resetSimulation = useCallback(async () => {
    abortRef.current = true; // Stop any running simulation
    setIsSimulating(false);
    setIsPaused(false);
    setIsResetting(true);

    // Store current stats for animation (calculate from courses)
    const currentTotalSeats = courses.reduce((sum, c) => sum + c["Seat Limit"], 0);
    const currentUsedSeats = courses.reduce((sum, c) => sum + c["Seat Used"], 0);
    const currentAvailableSeats = courses.reduce((sum, c) => sum + c["Seat Left"], 0);
    setPrevStats({
      totalSeats: currentTotalSeats,
      usedSeats: currentUsedSeats,
      availableSeats: currentAvailableSeats,
    });

    addLog('🔄 Resetting database...');

    try {
      // Use API to reset test table
      await fetch('/api/simulator/reset', { method: 'POST' });

      // Reset stats
      setStats({
        registeredStudents: 0,
        totalRegistrations: 0,
        failedRegistrations: 0,
        startTime: null,
        elapsedTime: 0,
      });

      // Reset all notification states (cleared, read, resolved)
      // This allows courses to send notifications again after reset
      resetAllNotifications();
      addLog('🔔 Notification states reset');

      // Re-fetch courses to update the overview
      await fetchCourses();

      addLog('✅ Database reset complete');
      
      // Keep animation state for a bit longer
      setTimeout(() => setIsResetting(false), 800);
    } catch (error) {
      console.error('Reset error:', error);
      addLog('❌ Error resetting database');
      setIsResetting(false);
    }
  }, [initTestTable, addLog, fetchCourses, courses]);

  // Inject seats to a specific course
  const injectSeats = useCallback(async (course: CourseData, amount: number) => {
    if (!course) return;
    
    const newUsed = Math.max(0, Math.min(course["Seat Limit"], course["Seat Used"] + amount));
    const newLeft = course["Seat Limit"] - newUsed;
    
    try {
      // Use API route with service role key to ensure realtime triggers
      const response = await fetch('/api/simulator/update-seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseCode: course["Course Code"],
          section: course["Section"],
          seatUsed: newUsed,
          seatLeft: newLeft
        })
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Update failed');
      }

      const action = amount > 0 ? 'Added' : 'Removed';
      addLog(`✅ ${action} ${Math.abs(amount)} seat(s) ${amount > 0 ? 'to' : 'from'} ${course["Course Code"]}-${course["Section"]} (Left: ${newLeft})`);
      
      // Add floating animation
      const courseKey = `${course["Course Code"]}-${course["Section"]}`;
      const changeId = ++changeIdRef.current;
      setSeatChanges(prev => [...prev, { courseKey, change: amount, id: changeId }]);
      setTimeout(() => {
        setSeatChanges(prev => prev.filter(c => c.id !== changeId));
      }, 1500);
      
      // Update selected course if it's the same one
      if (selectedCourse && selectedCourse["Course Code"] === course["Course Code"] && selectedCourse["Section"] === course["Section"]) {
        setSelectedCourse({ ...course, "Seat Used": newUsed, "Seat Left": newLeft });
      }
    } catch (error) {
      addLog(`❌ Failed to update ${course["Course Code"]}`);
    }
  }, [addLog, selectedCourse]);

  // Filter courses for search
  const filteredCourses = courses.filter(c => 
    searchQuery.trim() === '' || 
    c["Course Code"].toLowerCase().includes(searchQuery.toLowerCase()) ||
    c["Course Title"].toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 10);

  // Manual registration
  const handleManualRegister = useCallback(async () => {
    if (!manualCourseCode.trim()) {
      addLog('⚠️ Please enter a course code');
      return;
    }

    const course = courses.find(c => 
      c["Course Code"].toLowerCase() === manualCourseCode.toLowerCase()
    );

    if (!course) {
      addLog(`❌ Course ${manualCourseCode} not found`);
      return;
    }

    if (course["Seat Left"] < manualSeats) {
      addLog(`⚠️ Not enough seats in ${manualCourseCode}. Available: ${course["Seat Left"]}`);
      return;
    }

    try {
      const { error } = await supabase
        .from(TEST_TABLE)
        .update({
          "Seat Used": course["Seat Used"] + manualSeats,
          "Seat Left": course["Seat Left"] - manualSeats
        })
        .eq('Course Code', course["Course Code"])
        .eq('Section', course["Section"]);

      if (error) throw error;

      addLog(`✅ Manually registered ${manualSeats} seat(s) to ${manualCourseCode}`);
      setStats(prev => ({
        ...prev,
        totalRegistrations: prev.totalRegistrations + manualSeats,
      }));
    } catch (error) {
      addLog(`❌ Failed to register to ${manualCourseCode}`);
    }
  }, [manualCourseCode, manualSeats, courses, addLog]);

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate stats
  const totalSeats = courses.reduce((sum, c) => sum + c["Seat Limit"], 0);
  const usedSeats = courses.reduce((sum, c) => sum + c["Seat Used"], 0);
  const availableSeats = courses.reduce((sum, c) => sum + c["Seat Left"], 0);
  const fillRate = totalSeats > 0 ? ((usedSeats / totalSeats) * 100).toFixed(1) : '0';

  return (
    <RoleGuard requiredRole="admin">
      <GCPLayout activeFeature="Registration Simulator" projectName="Registration Simulator">
      <div className="min-h-screen bg-gray-50">
        {/* Compact Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Left: Title */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <Activity className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Registration Simulator</h1>
                  <p className="text-xs text-gray-500">Real-time seat monitoring & testing</p>
                </div>
              </div>

              {/* Center: Simulation Status Indicator */}
              <div className={`flex items-center gap-3 px-4 py-2 rounded-lg border-2 transition-all ${
                isSimulating 
                  ? 'bg-green-50 border-green-500 shadow-sm shadow-green-200' 
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className={`w-3 h-3 rounded-full ${isSimulating ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                <div className="text-sm">
                  <span className={`font-semibold ${isSimulating ? 'text-green-700' : 'text-gray-600'}`}>
                    {isSimulating ? 'RUNNING' : 'STOPPED'}
                  </span>
                  {isSimulating && (
                    <span className="text-green-600 ml-2">
                      Student #{stats.registeredStudents}/{config.totalStudents}
                    </span>
                  )}
                </div>
                {isSimulating && (
                  <div className="flex items-center gap-1 text-xs text-green-600 border-l border-green-300 pl-3 ml-1">
                    <Timer className="w-3 h-3" />
                    {formatTime(stats.elapsedTime)}
                  </div>
                )}
              </div>

              {/* Right: Quick Stats */}
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                  <Database className={`w-4 h-4 ${isUsingTestData ? 'text-green-600' : 'text-gray-400'}`} />
                  <span className="text-gray-700">{isUsingTestData ? 'Test DB' : 'No DB'}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                  <BookOpen className="w-4 h-4 text-red-600" />
                  <span className="text-gray-700">{courses.length} courses</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <section className="py-6">
          <div className="max-w-7xl mx-auto px-6">

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Controls */}
            <div className="lg:col-span-1 space-y-6">
              {/* Mode Selection */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all duration-300">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-red-600" />
                  Simulation Mode
                </h2>
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, mode: 'random' }))}
                    className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all duration-200 ${
                      config.mode === 'random'
                        ? 'bg-red-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Random
                  </button>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, mode: 'manual' }))}
                    className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all duration-200 ${
                      config.mode === 'manual'
                        ? 'bg-red-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Manual
                  </button>
                </div>

                {config.mode === 'random' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Total Students
                      </label>
                      <input
                        type="number"
                        value={config.totalStudents || ''}
                        onChange={(e) => setConfig(prev => ({ ...prev, totalStudents: e.target.value === '' ? 0 : parseInt(e.target.value) }))}
                        onBlur={(e) => { if (!e.target.value || parseInt(e.target.value) < 1) setConfig(prev => ({ ...prev, totalStudents: 1 })) }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        min={1}
                        max={10000}
                        disabled={isSimulating}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Courses per Student
                      </label>
                      <input
                        type="number"
                        value={config.coursesPerStudent || ''}
                        onChange={(e) => setConfig(prev => ({ ...prev, coursesPerStudent: e.target.value === '' ? 0 : parseInt(e.target.value) }))}
                        onBlur={(e) => { if (!e.target.value || parseInt(e.target.value) < 1) setConfig(prev => ({ ...prev, coursesPerStudent: 1 })) }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        min={1}
                        max={10}
                        disabled={isSimulating}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Students per Minute
                      </label>
                      <input
                        type="number"
                        value={config.studentsPerMinute || ''}
                        onChange={(e) => setConfig(prev => ({ ...prev, studentsPerMinute: e.target.value === '' ? 0 : parseInt(e.target.value) }))}
                        onBlur={(e) => { if (!e.target.value || parseInt(e.target.value) < 1) setConfig(prev => ({ ...prev, studentsPerMinute: 1 })) }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        min={1}
                        max={1000}
                        disabled={isSimulating}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Course Search */}
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Search Course
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setShowCourseDropdown(true);
                          }}
                          onFocus={() => setShowCourseDropdown(true)}
                          placeholder="Search by code or title..."
                          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        />
                      </div>
                      
                      {/* Dropdown */}
                      {showCourseDropdown && searchQuery && filteredCourses.length > 0 && (
                        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filteredCourses.map((course, idx) => {
                            const fillPercent = course["Seat Limit"] > 0 ? (course["Seat Used"] / course["Seat Limit"]) * 100 : 0;
                            return (
                              <button
                                key={`${course["Course Code"]}-${course["Section"]}-${idx}`}
                                onClick={() => {
                                  setSelectedCourse(course);
                                  setSearchQuery('');
                                  setShowCourseDropdown(false);
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between border-b border-gray-100 last:border-0"
                              >
                                <div>
                                  <span className="font-medium text-gray-900">{course["Course Code"]}</span>
                                  <span className="text-gray-500 text-xs ml-2">Sec {course["Section"]}</span>
                                  <p className="text-xs text-gray-500 truncate max-w-[180px]">{course["Course Title"]}</p>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${
                                  fillPercent >= 100 ? 'bg-red-500' :
                                  fillPercent >= 80 ? 'bg-orange-500' :
                                  'bg-green-500'
                                }`}>
                                  {course["Seat Left"]}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Selected Course Card */}
                    {selectedCourse && (
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-bold text-gray-900">{selectedCourse["Course Code"]}</h4>
                            <p className="text-xs text-gray-500">Section {selectedCourse["Section"]}</p>
                            <p className="text-xs text-gray-600 mt-1 line-clamp-1">{selectedCourse["Course Title"]}</p>
                          </div>
                          <button 
                            onClick={() => setSelectedCourse(null)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            ×
                          </button>
                        </div>
                        
                        {/* Seat Progress */}
                        <div className="mb-3">
                          <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Seats Used</span>
                            <span>{selectedCourse["Seat Used"]} / {selectedCourse["Seat Limit"]}</span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-300 ${
                                selectedCourse["Seat Left"] === 0 ? 'bg-red-500' :
                                selectedCourse["Seat Left"] / selectedCourse["Seat Limit"] < 0.25 ? 'bg-orange-500' :
                                'bg-green-500'
                              }`}
                              style={{ width: `${(selectedCourse["Seat Used"] / selectedCourse["Seat Limit"]) * 100}%` }}
                            />
                          </div>
                          <p className="text-center text-sm font-bold mt-2">
                            <span className={
                              selectedCourse["Seat Left"] === 0 ? 'text-red-600' :
                              selectedCourse["Seat Left"] / selectedCourse["Seat Limit"] < 0.25 ? 'text-orange-600' :
                              'text-green-600'
                            }>
                              {selectedCourse["Seat Left"]} seats left
                            </span>
                          </p>
                        </div>

                        {/* Quick Actions */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <button
                            onClick={() => injectSeats(selectedCourse, -1)}
                            disabled={selectedCourse["Seat Used"] <= 0}
                            className="flex items-center justify-center gap-1 py-2 px-3 bg-green-100 text-green-700 rounded-lg font-medium hover:bg-green-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Minus className="w-4 h-4" />
                            Remove 1
                          </button>
                          <button
                            onClick={() => injectSeats(selectedCourse, 1)}
                            disabled={selectedCourse["Seat Left"] <= 0}
                            className="flex items-center justify-center gap-1 py-2 px-3 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Plus className="w-4 h-4" />
                            Add 1
                          </button>
                        </div>

                        {/* Bulk Actions */}
                        <div className="grid grid-cols-4 gap-1">
                          {[-10, -5, 5, 10].map(amount => (
                            <button
                              key={amount}
                              onClick={() => injectSeats(selectedCourse, amount)}
                              disabled={amount < 0 ? selectedCourse["Seat Used"] < Math.abs(amount) : selectedCourse["Seat Left"] < amount}
                              className={`py-1.5 px-2 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                amount < 0 
                                  ? 'bg-green-50 text-green-700 hover:bg-green-100' 
                                  : 'bg-red-50 text-red-700 hover:bg-red-100'
                              }`}
                            >
                              {amount > 0 ? '+' : ''}{amount}
                            </button>
                          ))}
                        </div>

                        {/* Fill/Empty Actions */}
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <button
                            onClick={() => injectSeats(selectedCourse, -selectedCourse["Seat Used"])}
                            disabled={selectedCourse["Seat Used"] <= 0}
                            className="py-2 px-3 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Empty All
                          </button>
                          <button
                            onClick={() => injectSeats(selectedCourse, selectedCourse["Seat Left"])}
                            disabled={selectedCourse["Seat Left"] <= 0}
                            className="py-2 px-3 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Fill All
                          </button>
                        </div>
                      </div>
                    )}

                    {!selectedCourse && (
                      <p className="text-sm text-gray-500 text-center py-4">
                        Search and select a course to inject/remove seats
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Control Buttons */}
              <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all duration-300">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Play className="w-5 h-5 text-red-600" />
                  Controls
                </h2>
                <div className="space-y-3">
                  {config.mode === 'random' && (
                    <>
                      {!isSimulating ? (
                        <button
                          onClick={startSimulation}
                          disabled={isLoading}
                          className="w-full py-3 px-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Play className="w-5 h-5" />
                          Start Simulation
                        </button>
                      ) : (
                        <button
                          onClick={pauseSimulation}
                          className="w-full py-3 px-4 bg-yellow-500 text-white rounded-lg font-medium hover:bg-yellow-600 transition-colors flex items-center justify-center gap-2"
                        >
                          <Pause className="w-5 h-5" />
                          Stop Simulation
                        </button>
                      )}
                    </>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {courses.length === 0 ? (
                      <button
                        onClick={initTestTable}
                        disabled={isLoading}
                        className="col-span-2 py-2.5 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                      >
                        <Database className="w-4 h-4" />
                        {isLoading ? 'Initializing...' : 'Initialize Test DB'}
                      </button>
                    ) : (
                      <button
                        onClick={resetSimulation}
                        disabled={isLoading}
                        className="py-2.5 px-4 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset DB
                      </button>
                    )}
                    <button
                      onClick={killAndReset}
                      className="py-2.5 px-4 bg-red-800 text-white rounded-lg font-medium hover:bg-red-900 transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <XCircle className="w-4 h-4" />
                      Kill & Reset
                    </button>
                  </div>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-2 text-red-600 mb-2">
                    <Users className="w-4 h-4" />
                    <span className="text-xs font-medium uppercase">Students</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 font-mono tabular-nums">
                    <AnimatedCounter value={stats.registeredStudents} />
                    <span className="text-sm font-normal text-gray-500">/{config.totalStudents}</span>
                  </p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-2 text-red-600 mb-2">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs font-medium uppercase">Elapsed</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 font-mono tabular-nums">{formatTime(stats.elapsedTime)}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-2 text-green-600 mb-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs font-medium uppercase">Success</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600 font-mono tabular-nums">
                    <AnimatedCounter value={stats.totalRegistrations} />
                  </p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-2 text-red-500 mb-2">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-xs font-medium uppercase">Failed</span>
                  </div>
                  <p className="text-2xl font-bold text-red-500 font-mono tabular-nums">
                    <AnimatedCounter value={stats.failedRegistrations} />
                  </p>
                </div>
              </div>

              {/* Analytics Suggestions Panel */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-red-600" />
                  Live Metrics
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Reg. Rate</span>
                    <span className="text-sm font-semibold text-gray-900 font-mono">
                      {stats.elapsedTime > 0 
                        ? (stats.totalRegistrations / (stats.elapsedTime / 60)).toFixed(1) 
                        : '0.0'}/min
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Success Rate</span>
                    <span className="text-sm font-semibold text-green-600 font-mono">
                      {(stats.totalRegistrations + stats.failedRegistrations) > 0 
                        ? ((stats.totalRegistrations / (stats.totalRegistrations + stats.failedRegistrations)) * 100).toFixed(1)
                        : '100.0'}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Avg. per Student</span>
                    <span className="text-sm font-semibold text-gray-900 font-mono">
                      {stats.registeredStudents > 0 
                        ? (stats.totalRegistrations / stats.registeredStudents).toFixed(1) 
                        : '0.0'} courses
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">DB Fill Rate</span>
                    <span className="text-sm font-semibold text-orange-600 font-mono">
                      {fillRate}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Data Display */}
            <div className="lg:col-span-2 space-y-6">
              {/* Overall Stats */}
              <div className={`bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all duration-500 ${isResetting ? 'ring-2 ring-red-500 ring-opacity-50' : ''}`}>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingUp className={`w-5 h-5 text-red-600 ${isResetting ? 'animate-spin' : ''}`} />
                  Database Overview
                  {isResetting && <span className="text-xs text-red-500 ml-2 animate-pulse">Resetting...</span>}
                </h2>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-red-600 font-mono tabular-nums">
                      <AnimatedCounter value={courses.length} />
                    </p>
                    <p className="text-sm text-gray-500">Total Courses</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gray-900 font-mono tabular-nums">
                      <AnimatedCounter value={totalSeats} />
                    </p>
                    <p className="text-sm text-gray-500">Total Seats</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-green-600 font-mono tabular-nums">
                      <AnimatedCounter value={availableSeats} />
                    </p>
                    <p className="text-sm text-gray-500">Available</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-orange-500 font-mono tabular-nums">
                      {fillRate}%
                    </p>
                    <p className="text-sm text-gray-500">Fill Rate</p>
                  </div>
                </div>
                {/* Progress Bar */}
                <div className="mt-4">
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full bg-gradient-to-r from-green-500 to-orange-500 transition-all ${isResetting ? 'duration-700' : 'duration-300'}`}
                      style={{ width: `${fillRate}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Course Table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-red-600" />
                    Course Seats (Real-time)
                  </h2>
                </div>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto relative">
                  <table className="w-full table-fixed">
                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Course</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Limit</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Used</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Left</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {isLoading ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                            Loading courses...
                          </td>
                        </tr>
                      ) : courses.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                            No courses found in test table
                          </td>
                        </tr>
                      ) : (
                        courses.map((course, index) => {
                          const fillPercent = course["Seat Limit"] > 0 
                            ? (course["Seat Used"] / course["Seat Limit"]) * 100 
                            : 0;
                          const status = fillPercent >= 100 ? 'full' : fillPercent >= 80 ? 'warn' : 'ok';
                          const courseKey = `${course["Course Code"]}-${course["Section"]}`;
                          const activeChange = seatChanges.find(c => c.courseKey === courseKey);
                          
                          return (
                            <tr key={`${courseKey}-${index}`} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                {course["Course Code"]}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                                {course["Course Title"]}
                              </td>
                              <td className="px-4 py-3 text-sm text-center text-gray-600 font-mono tabular-nums">
                                {course["Seat Limit"]}
                              </td>
                              <td className="px-4 py-3 text-sm text-center relative">
                                <SeatCounter 
                                  used={course["Seat Used"]} 
                                  total={course["Seat Limit"]} 
                                  className="text-sm"
                                />
                                {activeChange && (
                                  <span className={`absolute -top-1 left-1/2 transform -translate-x-1/2 text-xs font-bold animate-float-up ${
                                    activeChange.change > 0 ? 'text-orange-500' : 'text-green-500'
                                  }`}>
                                    {activeChange.change > 0 ? '+' : ''}{activeChange.change}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-center relative">
                                <AnimatedCounter 
                                  value={course["Seat Left"]} 
                                  className={`font-semibold ${
                                    status === 'full' ? 'text-red-600' :
                                    status === 'warn' ? 'text-orange-500' :
                                    'text-green-600'
                                  }`}
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                  status === 'full' ? 'bg-red-100 text-red-700' :
                                  status === 'warn' ? 'bg-orange-100 text-orange-700' :
                                  'bg-green-100 text-green-700'
                                }`}>
                                  {status === 'full' ? 'Full' : status === 'warn' ? 'Almost Full' : 'Available'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Activity Log */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-red-600" />
                    Activity Log
                  </h2>
                </div>
                <div className="h-[200px] overflow-y-auto p-4 bg-gray-900 font-mono text-sm rounded-b-xl">
                  {logs.length === 0 ? (
                    <p className="text-gray-500">No activity yet. Start a simulation to see logs.</p>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className="text-green-400 py-0.5">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        </section>
      </div>
    </GCPLayout>
    </RoleGuard>
  );
}
