'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { CoursePlanner } from '@/components/CoursePlanner'
import { GCPLayout } from '@/components/GCPLayout'
import DustBackgroundLight from '@/components/BackGroundAnimatedLight'

export default function CoursePlannerPage() {
  const router = useRouter()
  const { isLoading, isAuthenticated, user } = useAuth()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    }
    // Redirect non-admin users to course monitoring
    if (!isLoading && isAuthenticated && user?.role !== 'admin') {
      router.push('/course-monitoring')
    }
  }, [isLoading, isAuthenticated, user, router])

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <DustBackgroundLight particleMultiplier={0.5} />
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
      </div>
    )
  }

  // Not authenticated or not admin - will redirect
  if (!isAuthenticated || user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <DustBackgroundLight particleMultiplier={0.5} />
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
      </div>
    )
  }

  return (
    <>
      <DustBackgroundLight particleMultiplier={0.5} />
      <GCPLayout activeFeature="Course Planner" projectName="Course Planner">
        <CoursePlanner />
      </GCPLayout>
    </>
  )
}
