import React from 'react'
import { Edit, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CSVCourse } from './CourseBlock'

interface CourseDetailEditorProps {
  selectedGroup: CSVCourse[]
  onClose: () => void
  onEdit: (course: CSVCourse) => void
  onDelete: (courseCode: string, section: string) => void
  glowingCourses: Set<string>
  onDetailGlow: (courseId: string, direction: 'up' | 'down') => void
  GLOW_SIZE: string
  getGlowColor: (seatLeft: number, seatLimit: number) => string
  formatTime: (time: string) => string
}

export function CourseDetailEditor({
  selectedGroup,
  onClose,
  onEdit,
  onDelete,
  glowingCourses,
  onDetailGlow,
  GLOW_SIZE,
  getGlowColor,
  formatTime
}: CourseDetailEditorProps) {
  // Group courses by time for detail panel
  const groupByTime = (courses: CSVCourse[]) => {
    const timeGroups: Map<string, CSVCourse[]> = new Map()
    courses.forEach(course => {
      const key = `${formatTime(course.startTime)} - ${formatTime(course.endTime)}`
      if (!timeGroups.has(key)) {
        timeGroups.set(key, [])
      }
      timeGroups.get(key)!.push(course)
    })
    return Array.from(timeGroups.entries())
  }

  return (
    <div className="flex flex-col" style={{ width: '400px', maxHeight: '850px', top: '50px' }}>
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <h3 className="font-semibold text-gray-900">Course Details</h3>
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg font-light p-1 hover:bg-gray-100 rounded"
        >
          ✕
        </button>
      </div>
      
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {groupByTime(selectedGroup).map(([timeSlot, courses]) => (
          <div key={timeSlot} className="space-y-4">
            {/* Time header pill */}
            {/* <div className="inline-block px-4 py-2 bg-gray-100 rounded-full text-sm font-medium text-gray-700">
              {timeSlot}
            </div> */}
            
            {/* Course cards */}
            {courses.map((course) => {
              const courseId = `${course.courseCode}-${course.section}`
              const isGlowing = glowingCourses.has(`detail-${courseId}`)
              const seatRatio = course.seatLimit > 0 ? course.seatLeft / course.seatLimit : 0
              const progressPercent = course.seatLimit > 0 ? ((course.seatLimit - course.seatLeft) / course.seatLimit) * 100 : 0
              
              return (
                <div key={courseId} className="space-y-4">
                  {/* Main course card */}
                  <div 
                    className={cn(
                      "rounded-xl border-2 p-4 transition-all duration-200",
                      course.seatLeft === 0 ? "bg-red-50 border-red-200" :
                      seatRatio < 0.25 ? "bg-orange-50 border-orange-200" :
                      seatRatio < 0.5 ? "bg-amber-50 border-amber-200" :
                      "bg-emerald-50 border-emerald-200",
                      isGlowing && `shadow-${GLOW_SIZE}`,
                      isGlowing && getGlowColor(course.seatLeft, course.seatLimit)
                    )}
                  >
                    {/* Course header with code and seats */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-xl font-bold text-gray-900">{course.courseCode}</div>
                      <span className={cn(
                        "px-3 py-1 rounded-lg text-sm font-bold text-white",
                        course.seatLeft === 0 ? "bg-red-500" :
                        seatRatio < 0.25 ? "bg-orange-500" :
                        seatRatio < 0.5 ? "bg-amber-500" :
                        "bg-emerald-500"
                      )}>
                        {course.seatLeft}/{course.seatLimit}
                      </span>
                    </div>
                    
                    {/* Course title */}
                    <div className="text-sm text-gray-700 mb-3 uppercase">
                      {course.courseTitle}
                    </div>
                    
                    {/* Section and Instructor */}
                    <div className="space-y-1 text-sm text-gray-600 mb-4">
                      <div><span className="font-medium">Section:</span> {course.section}</div>
                      <div><span className="font-medium">Instructor:</span> {course.instructor || '-'}</div>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onEdit(course)
                        }}
                        className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(course.courseCode, course.section)
                        }}
                        className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                  
                  {/* Course Information card */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Course Information</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Day:</span>
                        <span className="text-gray-900 font-medium">{course.day}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Time:</span>
                        <span className="text-gray-900 font-medium">{formatTime(course.startTime)} - {formatTime(course.endTime)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Section:</span>
                        <span className="text-gray-900 font-medium">{course.section}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Instructor:</span>
                        <span className="text-gray-900 font-medium">{course.instructor || '-'}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Enrollment card */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Enrollment</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Current Enrollment:</span>
                        <span className="text-gray-900 font-medium">{course.seatUsed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Max Capacity:</span>
                        <span className="text-gray-900 font-medium">{course.seatLimit}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Available Seats:</span>
                        <span className={cn(
                          "font-medium",
                          course.seatLeft === 0 ? "text-red-500" :
                          seatRatio < 0.25 ? "text-orange-500" :
                          seatRatio < 0.5 ? "text-amber-500" :
                          "text-emerald-500"
                        )}>{course.seatLeft}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">Progress</span>
                        <span className="text-gray-500 text-xs">{Math.round(progressPercent)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={cn(
                            "h-2 rounded-full transition-all",
                            course.seatLeft === 0 ? "bg-red-500" :
                            seatRatio < 0.25 ? "bg-orange-500" :
                            seatRatio < 0.5 ? "bg-amber-500" :
                            "bg-emerald-500"
                          )}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Status card */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Status</h4>
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-3 h-3 rounded-full",
                        course.seatLeft > 0 ? "bg-emerald-500" : "bg-red-500"
                      )} />
                      <span className="text-sm font-medium text-gray-900">
                        {course.seatLeft > 0 ? "Available" : "Full"}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
