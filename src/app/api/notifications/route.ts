import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const NOTIFICATION_TABLE = 'data_vme_notification'

// GET - Fetch all notifications
export async function GET(request: Request) {
  try {
    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from(NOTIFICATION_TABLE)
      .select('*')
      .order('Order', { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq('notification_status', status)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create a new notification
export async function POST(request: Request) {
  try {
    const supabase = createServerClient()
    const body = await request.json()

    const newNotification = {
      ...body,
      "Order": body["Order"] || Date.now(),
      notification_type: body.notification_type || 'COURSE_FULL',
      notification_status: body.notification_status || 'unread',
      created_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from(NOTIFICATION_TABLE)
      .insert([newNotification])
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Update notification (mark as read/resolved)
export async function PATCH(request: Request) {
  try {
    const supabase = createServerClient()
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Notification ID required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from(NOTIFICATION_TABLE)
      .update(updates)
      .eq('Order', parseInt(id))
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete a notification
export async function DELETE(request: Request) {
  try {
    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Notification ID required' }, { status: 400 })
    }

    const { error } = await supabase
      .from(NOTIFICATION_TABLE)
      .delete()
      .eq('Order', parseInt(id))

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
