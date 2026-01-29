'use client'

import { useState } from 'react'
import { X, Plus, AlertCircle } from 'lucide-react'
import { DAYS } from '@/lib/types'

interface AddClassModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface FormData {
  courseCode: string
  prefix: string
  courseId: string
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
  dayNumber: string
  day: string
  midtermDate: string
  midtermStart: string
  midtermEnd: string
  finalDate: string
  finalStart: string
  finalEnd: string
}

interface FormErrors {
  [key: string]: string
}

export function AddClassModal({ isOpen, onClose, onSuccess }: AddClassModalProps) {
  const [formData, setFormData] = useState<FormData>({
    courseCode: '',
    prefix: '',
    courseId: '',
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
    dayNumber: '',
    day: '',
    midtermDate: '',
    midtermStart: '',
    midtermEnd: '',
    finalDate: '',
    finalStart: '',
    finalEnd: ''
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

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
      const response = await fetch('/api/classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          "Course Code": formData.courseCode.trim(),
          "Prefix": formData.prefix.trim(),
          "Course ID": formData.courseId ? Number(formData.courseId) : null,
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
          "Day Number": formData.dayNumber ? Number(formData.dayNumber) : null,
          "Day": formData.day,
          "Midterm Date": formData.midtermDate.trim() || null,
          "Midterm Start": formData.midtermStart.trim() || null,
          "Midterm End": formData.midtermEnd.trim() || null,
          "Final Date": formData.finalDate.trim() || null,
          "Final Start": formData.finalStart.trim() || null,
          "Final End": formData.finalEnd.trim() || null,
          "Order": Date.now()
        }),
      })

      const result = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: 'Class added successfully!' })
        setTimeout(() => {
          onClose()
          onSuccess()
        }, 1500)
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to add class' })
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

  const resetForm = () => {
    setFormData({
      courseCode: '',
      prefix: '',
      courseId: '',
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
      dayNumber: '',
      day: '',
      midtermDate: '',
      midtermStart: '',
      midtermEnd: '',
      finalDate: '',
      finalStart: '',
      finalEnd: ''
    })
    setErrors({})
    setMessage(null)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop with fade animation */}
      <div 
        className="fixed inset-0 bg-black/30 z-[100] animate-in fade-in duration-200 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal with scale + fade animation */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] bg-white border border-gray-200 rounded-2xl shadow-2xl z-[101] overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-800 text-sm">Add New Course</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Form fields */}
        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
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
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${
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
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
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
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${
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
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${
                    errors.section ? 'border-red-500' : 'border-gray-200'
                  }`}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Session</label>
                <select
                  value={formData.session}
                  onChange={(e) => handleInputChange('session', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
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
                  className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${
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
                  className={`w-28 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${
                    errors.startTime ? 'border-red-500' : 'border-gray-200'
                  }`}
                />
                <span className="text-gray-400">-</span>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => handleInputChange('endTime', e.target.value)}
                  className={`w-28 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${
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
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${
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
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${
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
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
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
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-gray-50"
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
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            {/* Exam Schedule - Collapsible style */}
            <details className="group">
              <summary className="text-xs font-medium text-gray-600 cursor-pointer hover:text-gray-800 list-none flex items-center gap-1">
                <span className="text-gray-400 group-open:rotate-90 transition-transform">▶</span>
                Exam Schedule (Optional)
              </summary>
              <div className="mt-3 space-y-3 pl-4 border-l-2 border-gray-100">
                {/* Midterm */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Midterm</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="date"
                      value={formData.midtermDate}
                      onChange={(e) => handleInputChange('midtermDate', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <input
                      type="time"
                      value={formData.midtermStart}
                      onChange={(e) => handleInputChange('midtermStart', e.target.value)}
                      className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="time"
                      value={formData.midtermEnd}
                      onChange={(e) => handleInputChange('midtermEnd', e.target.value)}
                      className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>
                {/* Final */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Final</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="date"
                      value={formData.finalDate}
                      onChange={(e) => handleInputChange('finalDate', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <input
                      type="time"
                      value={formData.finalStart}
                      onChange={(e) => handleInputChange('finalStart', e.target.value)}
                      className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="time"
                      value={formData.finalEnd}
                      onChange={(e) => handleInputChange('finalEnd', e.target.value)}
                      className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>
              </div>
            </details>
          </div>

          {/* Footer buttons */}
          <div className="flex gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
            <button
              type="button"
              onClick={resetForm}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Clear All
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Add Course
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
