'use client'

import { useState, useEffect } from 'react'
import { X, Save, AlertCircle } from 'lucide-react'
import { DAYS } from '@/lib/types'

interface CourseData {
  courseCode: string
  section: string
  prefix?: string
  courseTitle?: string
  seatLimit?: number
  seatUsed?: number
  seatLeft?: number
  startTime?: string
  endTime?: string
  instructorName?: string
  remark?: string
  session?: string
  day?: string
}

interface EditClassModalPlannerProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  course: CourseData | null
  userId?: string
}

interface FormData {
  courseCode: string
  prefix: string
  courseTitle: string
  section: string
  seatLimit: string
  seatUsed: string
  seatLeft: string
  startTime: string
  endTime: string
  instructorName: string
  remark: string
  session: string
  day: string
}

interface FormErrors {
  [key: string]: string
}

export function EditClassModalPlanner({ isOpen, onClose, onSuccess, course, userId }: EditClassModalPlannerProps) {
  const [formData, setFormData] = useState<FormData>({
    courseCode: '',
    prefix: '',
    courseTitle: '',
    section: '',
    seatLimit: '',
    seatUsed: '0',
    seatLeft: '',
    startTime: '',
    endTime: '',
    instructorName: '',
    remark: '',
    session: '',
    day: '',
  })

  const [originalCourseCode, setOriginalCourseCode] = useState('')
  const [originalSection, setOriginalSection] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Populate form when course data changes
  useEffect(() => {
    if (course) {
      setOriginalCourseCode(course.courseCode)
      setOriginalSection(course.section)
      setFormData({
        courseCode: course.courseCode || '',
        prefix: course.prefix || '',
        courseTitle: course.courseTitle || '',
        section: course.section || '',
        seatLimit: course.seatLimit?.toString() || '',
        seatUsed: course.seatUsed?.toString() || '0',
        seatLeft: course.seatLeft?.toString() || '',
        startTime: course.startTime || '',
        endTime: course.endTime || '',
        instructorName: course.instructorName || '',
        remark: course.remark || '',
        session: course.session || '',
        day: course.day || '',
      })
      setErrors({})
      setMessage(null)
    }
  }, [course])

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Required fields
    if (!formData.courseCode.trim()) newErrors.courseCode = 'Required'
    if (!formData.courseTitle.trim()) newErrors.courseTitle = 'Required'
    if (!formData.section.trim()) newErrors.section = 'Required'
    if (!formData.seatLimit.trim()) newErrors.seatLimit = 'Required'
    if (!formData.startTime.trim()) newErrors.startTime = 'Required'
    if (!formData.endTime.trim()) newErrors.endTime = 'Required'
    if (!formData.instructorName.trim()) newErrors.instructorName = 'Required'
    if (!formData.day.trim()) newErrors.day = 'Required'

    // Numeric validation
    if (formData.seatLimit && isNaN(Number(formData.seatLimit))) {
      newErrors.seatLimit = 'Must be a number'
    }
    if (formData.seatUsed && isNaN(Number(formData.seatUsed))) {
      newErrors.seatUsed = 'Must be a number'
    }

    // Time validation
    if (formData.startTime && formData.endTime) {
      const start = new Date(`2000-01-01T${formData.startTime}`)
      const end = new Date(`2000-01-01T${formData.endTime}`)
      if (start >= end) {
        newErrors.endTime = 'Must be after start'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    setIsLoading(true)
    setMessage(null)

    try {
      // Use PUT /api/planner endpoint for editing courses
      const response = await fetch('/api/planner', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          originalCourseCode,
          originalSection,
          userId,
          "Course Code": formData.courseCode.trim(),
          "Prefix": formData.prefix.trim(),
          "Course Title": formData.courseTitle.trim(),
          "Section": formData.section.trim(),
          "Seat Limit": Number(formData.seatLimit),
          "Seat Used": Number(formData.seatUsed) || 0,
          "Seat Left": Number(formData.seatLeft) || (Number(formData.seatLimit) - (Number(formData.seatUsed) || 0)),
          "Start Time": formData.startTime,
          "End Time": formData.endTime,
          "Instructor Name": formData.instructorName.trim(),
          "Remark": formData.remark.trim(),
          "Session": formData.session.trim(),
          "Day": formData.day,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: 'Course updated successfully!' })
        setTimeout(() => {
          onClose()
          onSuccess()
        }, 1500)
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to update course' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An unexpected error occurred' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  if (!isOpen || !course) return null

  return (
    <>
      {/* Backdrop with fade animation */}
      <div 
        className="fixed inset-0 bg-black/30 z-[200] animate-in fade-in duration-200 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal with scale + fade animation - centered on screen, always visible */}
      <div className="fixed inset-0 z-[201] flex items-center justify-center pointer-events-none p-4">
        <div className="pointer-events-auto w-[560px] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300 flex flex-col" style={{ maxHeight: 'calc(100vh - 32px)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-blue-50 flex-shrink-0">
            <h3 className="font-semibold text-gray-800 text-sm">Edit Course</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Form fields */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Message */}
            {message && (
              <div className={`p-2 rounded-lg flex items-center gap-2 text-sm ${
                message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
              }`}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="line-clamp-2">{message.text}</span>
              </div>
            )}

            {/* Course Code & Prefix */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Course Code *</label>
                <input
                  type="text"
                  value={formData.courseCode}
                  onChange={(e) => handleInputChange('courseCode', e.target.value)}
                  placeholder="e.g., CS101"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.courseCode ? 'border-red-500' : 'border-gray-200'
                  }`}
                />
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-gray-600 mb-1">Prefix</label>
                <input
                  type="text"
                  value={formData.prefix}
                  onChange={(e) => handleInputChange('prefix', e.target.value)}
                  placeholder="CSX"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Course Title */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Course Title *</label>
              <input
                type="text"
                value={formData.courseTitle}
                onChange={(e) => handleInputChange('courseTitle', e.target.value)}
                placeholder="e.g., Introduction to Programming"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.courseTitle ? 'border-red-500' : 'border-gray-200'
                }`}
              />
            </div>

            {/* Section & Session */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Section *</label>
                <input
                  type="text"
                  value={formData.section}
                  onChange={(e) => handleInputChange('section', e.target.value)}
                  placeholder="e.g., 001"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.section ? 'border-red-500' : 'border-gray-200'
                  }`}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Session</label>
                <select
                  value={formData.session}
                  onChange={(e) => handleInputChange('session', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select</option>
                  <option value="Morning">Morning</option>
                  <option value="Afternoon">Afternoon</option>
                </select>
              </div>
            </div>

            {/* Day & Time Range */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Schedule *</label>
              <div className="flex gap-2 items-center">
                <select
                  value={formData.day}
                  onChange={(e) => handleInputChange('day', e.target.value)}
                  className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.day ? 'border-red-500' : 'border-gray-200'
                  }`}
                >
                  <option value="">Day</option>
                  {DAYS.map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => handleInputChange('startTime', e.target.value)}
                  className={`w-28 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.startTime ? 'border-red-500' : 'border-gray-200'
                  }`}
                />
                <span className="text-gray-400">-</span>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => handleInputChange('endTime', e.target.value)}
                  className={`w-28 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.endTime ? 'border-red-500' : 'border-gray-200'
                  }`}
                />
              </div>
            </div>

            {/* Instructor */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Instructor Name *</label>
              <input
                type="text"
                value={formData.instructorName}
                onChange={(e) => handleInputChange('instructorName', e.target.value)}
                placeholder="e.g., Dr. John Smith"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.instructorName ? 'border-red-500' : 'border-gray-200'
                }`}
              />
            </div>

            {/* Seats */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Seats *</label>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-400 mb-0.5">Limit</label>
                  <input
                    type="number"
                    value={formData.seatLimit}
                    onChange={(e) => handleInputChange('seatLimit', e.target.value)}
                    placeholder="e.g., 40"
                    min="0"
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.seatLimit ? 'border-red-500' : 'border-gray-200'
                    }`}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-400 mb-0.5">Used</label>
                  <input
                    type="number"
                    value={formData.seatUsed}
                    onChange={(e) => handleInputChange('seatUsed', e.target.value)}
                    placeholder="e.g., 0"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-400 mb-0.5">Left (auto)</label>
                  <input
                    type="number"
                    value={formData.seatLeft}
                    onChange={(e) => handleInputChange('seatLeft', e.target.value)}
                    placeholder="Auto"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  />
                </div>
              </div>
            </div>

            {/* Remark */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Remark</label>
              <input
                type="text"
                value={formData.remark}
                onChange={(e) => handleInputChange('remark', e.target.value)}
                placeholder="Additional notes (optional)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
        </div>
      </div>
    </>
  )
}
