-- =====================================================
-- AU Monitoring - Notification System Schema
-- =====================================================
-- This SQL creates the data_vme_notification table for
-- tracking course full notifications and section expansion
-- =====================================================

-- Create the notification table
CREATE TABLE IF NOT EXISTS public.data_vme_notification (
  "Order" bigint NOT NULL,
  "Course Code" text NOT NULL,
  "Prefix" text NULL,
  "Course ID" bigint NULL,
  "Course Title" text NULL,
  "Section" text NULL,
  "Seat Limit" double precision NULL,
  "Seat Used" double precision NULL,
  "Seat Left" double precision NULL,
  "Start Time" text NULL,
  "End Time" text NULL,
  "Instructor Name" text NULL,
  "Remark" text NULL,
  "Session" text NULL,
  "Day Number" double precision NULL,
  "Day" character varying NULL,
  "Midterm Date" text NULL,
  "Midterm Start" text NULL,
  "Midterm End" text NULL,
  "Final Date" text NULL,
  "Final Start" text NULL,
  "Final End" text NULL,
  -- Additional notification tracking fields
  notification_type text DEFAULT 'COURSE_FULL',
  notification_status text DEFAULT 'unread',
  created_at timestamp with time zone DEFAULT now(),
  read_at timestamp with time zone NULL,
  resolved_at timestamp with time zone NULL,
  
  CONSTRAINT data_vme_notification_pkey PRIMARY KEY ("Order")
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_notification_status 
  ON public.data_vme_notification (notification_status);

CREATE INDEX IF NOT EXISTS idx_notification_type 
  ON public.data_vme_notification (notification_type);

CREATE INDEX IF NOT EXISTS idx_notification_created_at 
  ON public.data_vme_notification (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_course_code 
  ON public.data_vme_notification ("Course Code");

-- Enable Row Level Security (optional, based on your auth setup)
-- ALTER TABLE public.data_vme_notification ENABLE ROW LEVEL SECURITY;

-- Grant permissions (adjust based on your Supabase setup)
GRANT ALL ON public.data_vme_notification TO authenticated;
GRANT ALL ON public.data_vme_notification TO service_role;
GRANT SELECT ON public.data_vme_notification TO anon;

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.data_vme_notification;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE public.data_vme_notification IS 'Stores notifications for course full alerts and section expansion tracking';
COMMENT ON COLUMN public.data_vme_notification."Order" IS 'Primary key - timestamp-based unique identifier';
COMMENT ON COLUMN public.data_vme_notification.notification_type IS 'Type of notification: COURSE_FULL, SECTION_ADDED, SYSTEM, INFO';
COMMENT ON COLUMN public.data_vme_notification.notification_status IS 'Status: unread, read, resolved';
COMMENT ON COLUMN public.data_vme_notification.created_at IS 'When the notification was created';
COMMENT ON COLUMN public.data_vme_notification.read_at IS 'When the notification was marked as read';
COMMENT ON COLUMN public.data_vme_notification.resolved_at IS 'When the notification was resolved (e.g., new section added)';
