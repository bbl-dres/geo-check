# Supabase Edge Functions

## invite-user

Invites a new user to Geo-Check via Supabase Auth admin API.

### Why an Edge Function?

`supabase.auth.admin.inviteUserByEmail()` requires the **service role key**, which must never be exposed in the browser. This Edge Function acts as a secure proxy — the frontend sends a request with the user's JWT, the function validates the caller is an admin, then calls the admin API server-side.

### Endpoint

```
POST {SUPABASE_URL}/functions/v1/invite-user
```

### Request

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <user-jwt>
```

**Body:**
```json
{
  "email": "new.user@bbl.admin.ch",
  "role": "editor"
}
```

| Field | Type | Required | Values |
|-------|------|----------|--------|
| email | string | yes | Valid email address |
| role | string | yes | `reader`, `editor`, `admin` |

### Response

**Success (200):**
```json
{
  "message": "Invitation sent",
  "email": "new.user@bbl.admin.ch"
}
```

**Error (400/401/500):**
```json
{
  "message": "Error description"
}
```

| Status | Meaning |
|--------|---------|
| 200 | Invitation sent successfully |
| 400 | Missing or invalid fields |
| 401 | Not authenticated or not an admin |
| 409 | User already exists |
| 500 | Supabase API error |

### Implementation

Create the function in `supabase/functions/invite-user/index.ts`:

```typescript
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
      .eq('auth_id', caller.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'admin') {
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

    const validRoles = ['reader', 'editor', 'admin']
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ message: 'Ungültige Rolle' }),
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

    // 4. Optionally insert into users table
    // (or handle this via a Supabase auth trigger)
    await adminClient.from('users').upsert({
      auth_id: data.user.id,
      email: email,
      role: role
    }, { onConflict: 'email' })

    return new Response(
      JSON.stringify({ message: 'Invitation sent', email }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ message: err.message || 'Interner Fehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

### Deployment

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Login
supabase login

# Create the function
supabase functions new invite-user

# Copy the code above into supabase/functions/invite-user/index.ts

# Deploy
supabase functions deploy invite-user --project-ref acjpfhljskbkyugnslgj

# Set the SITE_URL secret (fallback for redirectTo)
supabase secrets set SITE_URL=https://your-app-url.ch
```

### What happens after the invite

1. Supabase sends an invite email to the new user automatically
2. The email contains a link back to the app with `#type=invite` in the URL hash
3. The app detects this token in `isPasswordRecoveryMode()` (handles both `type=recovery` and `type=invite`)
4. The password reset modal is shown, where the user sets their password
5. After saving, the account is active and the user can log in

### Frontend integration

The frontend calls this endpoint from `js/auth.js` in the `inviteUserByEmail()` function. The invite modal in `index.html` (`#modal-invite-user`) handles the UI flow with a form step and a confirmation step.
