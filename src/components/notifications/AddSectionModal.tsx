'use client'

import React, { useState, useEffect } from 'react'
import { X, Plus, AlertCircle, CheckCircle2, Clock, User, Users } from 'lucide-react'
import { Notification, NotificationRecord, AddSectionFormData } from '@/types/notification'
import { DAYS } from '@/lib/types'
import { cn } from '@/lib/utils'

interface AddSectionModalProps {
  isOpen: boolean
  onClose: () => void
  notification: Notification
  onSuccess: () => void
  addNewSection: (data: Partial<NotificationRecord>) => Promise<{ success: boolean; error?: string }>
}

interface FormErrors {
  [key: string]: string
}

export function AddSectionModal({ 
  isOpen, 
  onClose, 
  notification, 
  onSuccess,
  addNewSection 
}: AddSectionModalProps) {
  const [formData, setFormData] = useState<AddSectionFormData>({
    courseCode: '',
    courseTitle: '',
    prefix: '',
    section: '',
    seatLimit: 60,
    instructorName: '',
    day: '',
    dayNumber: 0,
    startTime: '',
    endTime: '',
    session: '',
    remark: '',
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Pre-fill form with notification data
  useEffect(() => {
    if (notification) {
      setFormData(prev => ({
        ...prev,
        courseCode: notification.courseCode || '',
        courseTitle: notification.courseTitle || '',
        section: generateNextSection(notification.section),
        seatLimit: notification.seatLimit || 60,
        instructorName: notification.instructorName || '',
        day: notification.day || '',
        startTime: notification.startTime || '',
        endTime: notification.endTime || '',
      }))
    }
  }, [notification])

  // Generate next section number
  const generateNextSection = (currentSection?: string): string => {
    if (!currentSection) return '002'
    const num = parseInt(currentSection)
    if (isNaN(num)) return '002'
    return String(num + 1).padStart(3, '0')
  }

  // Get day number from day name
  const getDayNumber = (day: string): number => {
    const dayIndex = DAYS.indexOf(day as any)
    return dayIndex >= 0 ? dayIndex : 0
  }

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.courseCode.trim()) newErrors.courseCode = 'Required'
    if (!formData.section.trim()) newErrors.section = 'Required'
    if (!formData.seatLimit || formData.seatLimit <= 0) newErrors.seatLimit = 'Must be > 0'
    if (!formData.instructorName.trim()) newErrors.instructorName = 'Required'
    if (!formData.day) newErrors.day = 'Required'
    if (!formData.startTime) newErrors.startTime = 'Required'
    if (!formData.endTime) newErrors.endTime = 'Required'

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
      const newSectionData: Partial<NotificationRecord> = {
        "Course Code": formData.courseCode.trim(),
        "Course Title": formData.courseTitle.trim(),
        "Prefix": formData.prefix.trim() || null,
        "Section": formData.section.trim(),
        "Seat Limit": formData.seatLimit,
        "Seat Used": 0,
        "Seat Left": formData.seatLimit,
        "Instructor Name": formData.instructorName.trim(),
        "Day": formData.day,
        "Day Number": getDayNumber(formData.day),
        "Start Time": formData.startTime,
        "End Time": formData.endTime,
        "Session": formData.session || null,
        "Remark": formData.remark.trim() || null,
      }

      const result = await addNewSection(newSectionData)

      if (result.success) {
        setMessage({ type: 'success', text: 'New section added successfully!' })
        setTimeout(() => {
          onSuccess()
        }, 1500)
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to add section' })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'An unexpected error occurred' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (field: keyof AddSectionFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
    setMessage(null)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 z-[200] animate-in fade-in duration-200 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-[201] flex items-center justify-center pointer-events-none p-4">
        <div className="pointer-events-auto w-[520px] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300 flex flex-col" style={{ maxHeight: 'calc(100vh - 32px)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-red-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Plus className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Add New Section</h3>
                <p className="text-xs text-gray-500">
                  For {notification.courseCode} - {notification.courseTitle}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Alert banner */}
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-800">
              <strong>{notification.courseCode}</strong> is currently FULL with {notification.seatLimit} seats. 
              Adding a new section will help accommodate more students.
            </p>
          </div>
          
          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Message */}
              {message && (
                <div className={cn(
                  "p-3 rounded-lg flex items-center gap-2 text-sm",
                  message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
                )}>
                  {message.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{message.text}</span>
                </div>
              )}

              {/* Course Code & Section */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Course Code *
                  </label>
                  <input
                    type="text"
                    value={formData.courseCode}
                    onChange={(e) => handleInputChange('courseCode', e.target.value)}
                    className={cn(
                      "w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-gray-50",
                      errors.courseCode ? 'border-red-500' : 'border-gray-200'
                    )}
                    readOnly
                  />
                </div>
                <div className="w-28">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    New Section *
                  </label>
                  <input
                    type="text"
                    value={formData.section}
                    onChange={(e) => handleInputChange('section', e.target.value)}
                    placeholder="002"
                    className={cn(
                      "w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500",
                      errors.section ? 'border-red-500' : 'border-gray-200'
                    )}
                  />
                </div>
              </div>

              {/* Instructor */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  Instructor Name *
                </label>
                <input
                  type="text"
                  value={formData.instructorName}
                  onChange={(e) => handleInputChange('instructorName', e.target.value)}
                  placeholder="e.g., Dr. John Smith"
                  className={cn(
                    "w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500",
                    errors.instructorName ? 'border-red-500' : 'border-gray-200'
                  )}
                />
                {errors.instructorName && (
                  <p className="text-xs text-red-500 mt-1">{errors.instructorName}</p>
                )}
              </div>

              {/* Seat Limit */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  Maximum Seats *
                </label>
                <input
                  type="number"
                  value={formData.seatLimit}
                  onChange={(e) => handleInputChange('seatLimit', parseInt(e.target.value) || 0)}
                  min="1"
                  max="500"
                  className={cn(
                    "w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500",
                    errors.seatLimit ? 'border-red-500' : 'border-gray-200'
                  )}
                />
              </div>

              {/* Schedule */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Schedule *
                </label>
                <div className="flex gap-2 items-center">
                  <select
                    value={formData.day}
                    onChange={(e) => handleInputChange('day', e.target.value)}
                    className={cn(
                      "flex-1 px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500",
                      errors.day ? 'border-red-500' : 'border-gray-200'
                    )}
                  >
                    <option value="">Select Day</option>
                    {DAYS.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => handleInputChange('startTime', e.target.value)}
                    className={cn(
                      "w-28 px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500",
                      errors.startTime ? 'border-red-500' : 'border-gray-200'
                    )}
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => handleInputChange('endTime', e.target.value)}
                    className={cn(
                      "w-28 px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500",
                      errors.endTime ? 'border-red-500' : 'border-gray-200'
                    )}
                  />
                </div>
                {errors.endTime && (
                  <p className="text-xs text-red-500 mt-1">{errors.endTime}</p>
                )}
              </div>

              {/* Session */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Session
                </label>
                <select
                  value={formData.session}
                  onChange={(e) => handleInputChange('session', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Select Session</option>
                  <option value="Morning">Morning</option>
                  <option value="Afternoon">Afternoon</option>
                </select>
              </div>

              {/* Remark */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Remark (Optional)
                </label>
                <input
                  type="text"
                  value={formData.remark}
                  onChange={(e) => handleInputChange('remark', e.target.value)}
                  placeholder="Additional notes..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add Section
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
