// Notification types for the AU Monitoring system

export type NotificationType = 'COURSE_FULL' | 'SECTION_ADDED' | 'SYSTEM' | 'INFO'

export type NotificationStatus = 'unread' | 'read' | 'resolved'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  status: NotificationStatus
  courseCode?: string
  courseTitle?: string
  section?: string
  seatLimit?: number
  seatUsed?: number
  instructorName?: string
  day?: string
  startTime?: string
  endTime?: string
  createdAt: string
  readAt?: string
  resolvedAt?: string
}

// Matches the data_vme_notification table schema
export interface NotificationRecord {
  "Order": number
  "Course Code": string
  "Prefix": string | null
  "Course ID": number | null
  "Course Title": string | null
  "Section": string | null
  "Seat Limit": number | null
  "Seat Used": number | null
  "Seat Left": number | null
  "Start Time": string | null
  "End Time": string | null
  "Instructor Name": string | null
  "Remark": string | null
  "Session": string | null
  "Day Number": number | null
  "Day": string | null
  "Midterm Date": string | null
  "Midterm Start": string | null
  "Midterm End": string | null
  "Final Date": string | null
  "Final Start": string | null
  "Final End": string | null
  // Additional fields for notification tracking
  notification_type?: NotificationType
  notification_status?: NotificationStatus
  created_at?: string
  read_at?: string
  resolved_at?: string
}

// Form data for adding a new section
export interface AddSectionFormData {
  courseCode: string
  courseTitle: string
  prefix: string
  section: string
  seatLimit: number
  instructorName: string
  day: string
  dayNumber: number
  startTime: string
  endTime: string
  session: string
  remark: string
}

// Instructor schedule for conflict checking
export interface InstructorSchedule {
  instructorName: string
  day: string
  dayNumber: number
  startTime: string
  endTime: string
  courseCode: string
  section: string
}

// Time conflict result
export interface TimeConflictResult {
  hasConflict: boolean
  conflictingCourse?: {
    courseCode: string
    section: string
    day: string
    startTime: string
    endTime: string
  }
  message?: string
}
