import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Course Planner uses a separate table
const PLANNER_TABLE = 'data_vme_planner'

// Helper function to convert time string (HH:MM) to minutes
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

// Helper function to check if two time ranges overlap
function timeRangesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  const s1 = timeToMinutes(start1)
  const e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2)
  const e2 = timeToMinutes(end2)
  
  // Two ranges overlap if one starts before the other ends
  return s1 < e2 && s2 < e1
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate required fields
    const requiredFields = ['Course Code', 'Course Title', 'Section', 'Start Time', 'End Time', 'Instructor Name', 'Day']
    for (const field of requiredFields) {
      if (!body[field] || body[field].toString().trim() === '') {
        return NextResponse.json({ 
          error: `${field} is required` 
        }, { status: 400 })
      }
    }

    // Use service role key to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Check for duplicate course_code + section in planner table
    const { data: existingClass, error: checkError } = await supabase
      .from(PLANNER_TABLE)
      .select('*')
      .eq('"Course Code"', body['Course Code'])
      .eq('Section', body['Section'])
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is expected
      console.error('Supabase check error:', checkError)
      return NextResponse.json({ error: checkError.message }, { status: 500 })
    }

    if (existingClass) {
      return NextResponse.json({ 
        error: `Class with Course Code "${body['Course Code']}" and Section "${body['Section']}" already exists` 
      }, { status: 409 })
    }

    // Check for instructor time conflict
    // An instructor cannot teach more than one course at the same time
    const instructorName = body['Instructor Name'].trim()
    const newDay = body['Day']
    const newStartTime = body['Start Time']
    const newEndTime = body['End Time']

    const { data: instructorCourses, error: instructorError } = await supabase
      .from(PLANNER_TABLE)
      .select('"Course Code", "Section", "Day", "Start Time", "End Time"')
      .eq('"Instructor Name"', instructorName)
      .eq('Day', newDay)

    if (instructorError) {
      console.error('Instructor check error:', instructorError)
      return NextResponse.json({ error: instructorError.message }, { status: 500 })
    }

    // Check for time overlap with existing courses
    if (instructorCourses && instructorCourses.length > 0) {
      for (const course of instructorCourses) {
        const existingStart = course['Start Time']
        const existingEnd = course['End Time']
        
        if (timeRangesOverlap(newStartTime, newEndTime, existingStart, existingEnd)) {
          return NextResponse.json({ 
            error: `Instructor "${instructorName}" already has a class (${course['Course Code']} - Section ${course['Section']}) on ${newDay} from ${existingStart} to ${existingEnd} that conflicts with this time slot (${newStartTime} - ${newEndTime}).`
          }, { status: 409 })
        }
      }
    }

    // Get the next Order value
    const { data: maxOrderResult, error: maxOrderError } = await supabase
      .from(PLANNER_TABLE)
      .select('"Order"')
      .order('"Order"', { ascending: false })
      .limit(1)
      .single()

    let nextOrder = 1
    if (!maxOrderError && maxOrderResult) {
      nextOrder = (maxOrderResult.Order || 0) + 1
    }

    // Prepare the data for insertion
    const classData = {
      ...body,
      "Order": body.Order || nextOrder, // Use provided Order or next available
      "Course ID": body["Course ID"] || null,
      "Seat Limit": Number(body["Seat Limit"]),
      "Seat Used": Number(body["Seat Used"]) || 0,
      "Seat Left": Number(body["Seat Left"]) || (Number(body["Seat Limit"]) - (Number(body["Seat Used"]) || 0)),
      "Day Number": body["Day Number"] ? Number(body["Day Number"]) : null,
      "Midterm Date": body["Midterm Date"] || null,
      "Midterm Start": body["Midterm Start"] || null,
      "Midterm End": body["Midterm End"] || null,
      "Final Date": body["Final Date"] || null,
      "Final Start": body["Final Start"] || null,
      "Final End": body["Final End"] || null,
    }

    // Insert the new class into planner table
    const { data, error } = await supabase
      .from(PLANNER_TABLE)
      .insert([classData])
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Class added successfully',
      data 
    }, { status: 201 })

  } catch (error: any) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ 
      error: error.message || 'An unexpected error occurred' 
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const courseCode = searchParams.get('courseCode')
    const section = searchParams.get('section')
    const userId = searchParams.get('userId')

    if (!courseCode || !section) {
      return NextResponse.json({ 
        error: 'Course Code and Section are required' 
      }, { status: 400 })
    }

    // Use service role key to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Verify user is admin (server-side protection)
    if (userId) {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single()

      if (userError || !userData || userData.role !== 'admin') {
        return NextResponse.json({ 
          error: 'Unauthorized: Admin access required' 
        }, { status: 403 })
      }
    }

    // Check if the course exists in planner table
    const { data: existingClass, error: checkError } = await supabase
      .from(PLANNER_TABLE)
      .select('*')
      .eq('"Course Code"', courseCode)
      .eq('Section', section)
      .single()

    if (checkError && checkError.code === 'PGRST116') {
      return NextResponse.json({ 
        error: `Class with Course Code "${courseCode}" and Section "${section}" not found` 
      }, { status: 404 })
    }

    if (checkError) {
      console.error('Supabase check error:', checkError)
      return NextResponse.json({ error: checkError.message }, { status: 500 })
    }

    // Delete the course from planner table
    const { error: deleteError } = await supabase
      .from(PLANNER_TABLE)
      .delete()
      .eq('"Course Code"', courseCode)
      .eq('Section', section)

    if (deleteError) {
      console.error('Supabase delete error:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ 
      message: `Class "${courseCode}" Section "${section}" deleted successfully`
    }, { status: 200 })

  } catch (error: any) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ 
      error: error.message || 'An unexpected error occurred' 
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Original course code and section are required to identify the course to update
    const originalCourseCode = body.originalCourseCode
    const originalSection = body.originalSection
    const userId = body.userId

    if (!originalCourseCode || !originalSection) {
      return NextResponse.json({ 
        error: 'Original Course Code and Section are required to identify the course' 
      }, { status: 400 })
    }

    // Validate required fields for the update
    const requiredFields = ['Course Code', 'Course Title', 'Section', 'Start Time', 'End Time', 'Instructor Name', 'Day']
    for (const field of requiredFields) {
      if (!body[field] || body[field].toString().trim() === '') {
        return NextResponse.json({ 
          error: `${field} is required` 
        }, { status: 400 })
      }
    }

    // Use service role key to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Verify user is admin (server-side protection)
    if (userId) {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single()

      if (userError || !userData || userData.role !== 'admin') {
        return NextResponse.json({ 
          error: 'Unauthorized: Admin access required' 
        }, { status: 403 })
      }
    }

    // Check if the original course exists
    const { data: existingClass, error: checkError } = await supabase
      .from(PLANNER_TABLE)
      .select('*')
      .eq('"Course Code"', originalCourseCode)
      .eq('Section', originalSection)
      .single()

    if (checkError && checkError.code === 'PGRST116') {
      return NextResponse.json({ 
        error: `Class with Course Code "${originalCourseCode}" and Section "${originalSection}" not found` 
      }, { status: 404 })
    }

    if (checkError) {
      console.error('Supabase check error:', checkError)
      return NextResponse.json({ error: checkError.message }, { status: 500 })
    }

    // If course code or section changed, check for duplicates
    const newCourseCode = body['Course Code']
    const newSection = body['Section']
    if (newCourseCode !== originalCourseCode || newSection !== originalSection) {
      const { data: duplicateClass, error: dupError } = await supabase
        .from(PLANNER_TABLE)
        .select('*')
        .eq('"Course Code"', newCourseCode)
        .eq('Section', newSection)
        .single()

      if (dupError && dupError.code !== 'PGRST116') {
        console.error('Supabase duplicate check error:', dupError)
        return NextResponse.json({ error: dupError.message }, { status: 500 })
      }

      if (duplicateClass) {
        return NextResponse.json({ 
          error: `Class with Course Code "${newCourseCode}" and Section "${newSection}" already exists` 
        }, { status: 409 })
      }
    }

    // Check for instructor time conflict (excluding the current course being edited)
    const instructorName = body['Instructor Name'].trim()
    const newDay = body['Day']
    const newStartTime = body['Start Time']
    const newEndTime = body['End Time']

    const { data: instructorCourses, error: instructorError } = await supabase
      .from(PLANNER_TABLE)
      .select('"Course Code", "Section", "Day", "Start Time", "End Time"')
      .eq('"Instructor Name"', instructorName)
      .eq('Day', newDay)

    if (instructorError) {
      console.error('Instructor check error:', instructorError)
      return NextResponse.json({ error: instructorError.message }, { status: 500 })
    }

    // Check for time overlap with existing courses (excluding the course being edited)
    if (instructorCourses && instructorCourses.length > 0) {
      for (const course of instructorCourses) {
        // Skip the course being edited
        if (course['Course Code'] === originalCourseCode && course['Section'] === originalSection) {
          continue
        }
        
        const existingStart = course['Start Time']
        const existingEnd = course['End Time']
        
        if (timeRangesOverlap(newStartTime, newEndTime, existingStart, existingEnd)) {
          return NextResponse.json({ 
            error: `Instructor "${instructorName}" already has a class (${course['Course Code']} - Section ${course['Section']}) on ${newDay} from ${existingStart} to ${existingEnd} that conflicts with this time slot (${newStartTime} - ${newEndTime}).`
          }, { status: 409 })
        }
      }
    }

    // Prepare the data for update
    const updateData = {
      "Course Code": body["Course Code"],
      "Prefix": body["Prefix"] || null,
      "Course ID": body["Course ID"] || null,
      "Course Title": body["Course Title"],
      "Section": body["Section"],
      "Seat Limit": Number(body["Seat Limit"]),
      "Seat Used": Number(body["Seat Used"]) || 0,
      "Seat Left": Number(body["Seat Left"]) || (Number(body["Seat Limit"]) - (Number(body["Seat Used"]) || 0)),
      "Start Time": body["Start Time"],
      "End Time": body["End Time"],
      "Instructor Name": body["Instructor Name"],
      "Remark": body["Remark"] || null,
      "Session": body["Session"] || null,
      "Day Number": body["Day Number"] ? Number(body["Day Number"]) : null,
      "Day": body["Day"],
      "Midterm Date": body["Midterm Date"] || null,
      "Midterm Start": body["Midterm Start"] || null,
      "Midterm End": body["Midterm End"] || null,
      "Final Date": body["Final Date"] || null,
      "Final Start": body["Final Start"] || null,
      "Final End": body["Final End"] || null,
    }

    // Update the course in planner table
    const { data, error } = await supabase
      .from(PLANNER_TABLE)
      .update(updateData)
      .eq('"Course Code"', originalCourseCode)
      .eq('Section', originalSection)
      .select()
      .single()

    if (error) {
      console.error('Supabase update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      message: 'Class updated successfully',
      data 
    }, { status: 200 })

  } catch (error: any) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ 
      error: error.message || 'An unexpected error occurred' 
    }, { status: 500 })
  }
}
