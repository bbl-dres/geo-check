import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 1. Verify the calling user is authenticated and is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ message: 'Nicht authentifiziert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create client with the caller's JWT to check their role
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user: caller } } = await userClient.auth.getUser()
    if (!caller) {
      return new Response(
        JSON.stringify({ message: 'Nicht authentifiziert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check caller is admin (lookup in users table)
    const { data: callerProfile } = await userClient
      .from('users')
      .select('role')
      .eq('auth_user_id', caller.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'Admin') {
      return new Response(
        JSON.stringify({ message: 'Keine Berechtigung. Nur Admins können Benutzer einladen.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Parse request body
    const { email, role } = await req.json()

    if (!email || !role) {
      return new Response(
        JSON.stringify({ message: 'E-Mail und Rolle sind erforderlich' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const validRoles = ['Leser', 'Bearbeiter', 'Admin']
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ message: 'Ungültige Rolle. Erlaubt: Leser, Bearbeiter, Admin' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Invite user via admin API (requires service role key)
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { role },
      redirectTo: `${req.headers.get('origin') || Deno.env.get('SITE_URL')}`
    })

    if (error) {
      const status = error.message.includes('already') ? 409 : 500
      return new Response(
        JSON.stringify({ message: error.message }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Insert into users table
    await adminClient.from('users').upsert({
      auth_user_id: data.user.id,
      email: email,
      role: role
    }, { onConflict: 'email' })

    return new Response(
      JSON.stringify({ message: 'Invitation sent', email }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ message: (err as Error).message || 'Interner Fehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
