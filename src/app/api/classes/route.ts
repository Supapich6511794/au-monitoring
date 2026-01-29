import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    // Check for duplicate course_code + section
    const { data: existingClass, error: checkError } = await supabase
      .from('data_vme')
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
      .from('data_vme')
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
      .from('data_vme')
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

    // Insert the new class
    const { data, error } = await supabase
      .from('data_vme')
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

    // Check if the course exists
    const { data: existingClass, error: checkError } = await supabase
      .from('data_vme')
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

    // Delete the course
    const { error: deleteError } = await supabase
      .from('data_vme')
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
