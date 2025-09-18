/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from 'npm:@supabase/supabase-js'
import { Webhook } from 'npm:svix'

Deno.serve(async (req) => {
  try {
    console.log('🔗 Webhook received from Clerk')
    
    // Verify webhook signature
    const webhookSecret = Deno.env.get('CLERK_WEBHOOK_SECRET')
    if (!webhookSecret) {
      console.error('❌ CLERK_WEBHOOK_SECRET not configured')
      return new Response('Webhook secret not configured', { status: 500 })
    }

    // Debug: Log all headers to see what's being sent
    console.log('📋 All incoming headers:', Object.fromEntries(req.headers.entries()))

    // Get Svix headers for webhook verification
    const svix_id = req.headers.get('svix-id')
    const svix_timestamp = req.headers.get('svix-timestamp') 
    const svix_signature = req.headers.get('svix-signature')

    console.log('🔐 Svix headers:', { svix_id, svix_timestamp, svix_signature })

    // Get the body
    const body = await req.text()
    console.log('📦 Request body:', body)

    let event

    if (!svix_id || !svix_timestamp || !svix_signature) {
      console.log('⚠️ No Svix headers found, trying direct parse (development/testing mode)')
      try {
        event = JSON.parse(body)
        console.log('✅ Parsed event directly:', event.type)
      } catch (err) {
        console.error('❌ Error parsing body directly:', err)
        return new Response('Error: Invalid JSON body and missing Svix headers', { status: 400 })
      }
    } else {
      // Verify webhook using Svix
      const wh = new Webhook(webhookSecret)
      try {
        event = wh.verify(body, {
          'svix-id': svix_id,
          'svix-timestamp': svix_timestamp,
          'svix-signature': svix_signature,
        })
        console.log('✅ Webhook verified with Svix:', event.type)
      } catch (err) {
        console.error('❌ Svix verification failed:', err)
        return new Response('Error verifying webhook', { status: 401 })
      }
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Supabase credentials not configured')
      return new Response('Supabase credentials not configured', { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    console.log('💾 Supabase client created')

    switch (event.type) {
      case 'user.created': {
        console.log('👤 Processing user.created for:', event.data.id)
        
        // Handle email properly - Clerk users might not have email addresses
        const emailAddress = event.data.email_addresses?.[0]?.email_address
        const email = emailAddress || `${event.data.id}@placeholder.clerk.local`  // Create placeholder email if none exists
        const fullName = `${event.data.first_name || ''} ${event.data.last_name || ''}`.trim()
        
        console.log('📧 User email (original):', emailAddress || 'No email provided')
        console.log('📧 User email (using):', email)
        console.log('👤 Full name:', fullName)
        console.log('🆔 Clerk ID:', event.data.id)
        console.log('🖼️ Avatar URL:', event.data.image_url)
        
        // Insert into users table with correct schema matching clento-new-database.sql
        const userData = {
          external_id: event.data.id,     // Clerk user ID -> external_id (text NOT uuid!)
          email: email,                   // Use placeholder if no real email
          full_name: fullName || null,    // Optional field
          avatar_url: event.data.image_url || null,  // Optional field
          auth_user_id: null,             // EXPLICITLY set to null to prevent conflicts
          // IMPORTANT: Do NOT include 'id' field - let PostgreSQL auto-generate the UUID
        }
        
        console.log('💾 Inserting user data:', JSON.stringify(userData, null, 2))
        console.log('🔍 Verifying external_id is text, not UUID:', typeof userData.external_id)
        
        // Try insert with RLS bypass (using service role key)
        console.log('🔍 About to insert user with external_id (text):', userData.external_id)
        console.log('🔍 About to insert user with auth_user_id (null):', userData.auth_user_id)
        console.log('🔍 Using service role key to bypass RLS')
        
        // Create a new client specifically for this insert to ensure we're using service role
        const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        })
        
        const { data: user, error } = await adminSupabase
          .from('users')
          .insert([userData])
          .select('id, external_id, email, full_name, avatar_url, created_at, auth_user_id')
          .single()

        if (error) {
          console.error('❌ Error creating user:', JSON.stringify(error, null, 2))
          console.error('❌ Failed user data:', JSON.stringify(userData, null, 2))
          console.error('❌ Error code:', error.code)
          console.error('❌ Error message:', error.message)
          
          // Try a minimal insert as fallback
          console.log('🔄 Trying minimal insert with only required fields...')
          const minimalData = {
            external_id: event.data.id,
            email: email,
          }
          console.log('🔄 Minimal data:', JSON.stringify(minimalData, null, 2))
          
          const { data: userFallback, error: errorFallback } = await adminSupabase
            .from('users')
            .insert([minimalData])
            .select('id, external_id, email')
            .single()
          
          if (errorFallback) {
            console.error('❌ Fallback insert also failed:', JSON.stringify(errorFallback, null, 2))
            return new Response(JSON.stringify({ 
              error: error.message, 
              fallbackError: errorFallback.message,
              details: error,
              userData: userData 
            }), { status: 500 })
          } else {
            console.log('✅ Fallback insert succeeded:', userFallback.id)
            return new Response(JSON.stringify({ success: true, user: userFallback, note: 'Used fallback minimal insert' }), { status: 200 })
          }
        }

        console.log('✅ User created successfully with internal ID:', user.id)
        console.log('✅ User external_id (Clerk ID):', user.external_id)
        return new Response(JSON.stringify({ success: true, user }), { status: 200 })
      }

      case 'user.updated': {
        console.log('👤 Processing user.updated for:', event.data.id)
        
        // Handle email properly - Clerk users might not have email addresses
        const emailAddress = event.data.email_addresses?.[0]?.email_address
        const fullName = `${event.data.first_name || ''} ${event.data.last_name || ''}`.trim()
        
        console.log('📧 Updated user email (original):', emailAddress || 'No email provided')
        console.log('👤 Updated full name:', fullName)
        console.log('🔍 Looking for user with external_id:', event.data.id)
        
        // Update user with correct schema matching clento-new-database.sql
        const updateData = {
          // Only update email if one is provided, otherwise leave it as is
          ...(emailAddress && { email: emailAddress }),
          full_name: fullName || null,
          avatar_url: event.data.image_url || null,
          updated_at: new Date().toISOString(),
        }
        
        console.log('💾 Updating user data:', JSON.stringify(updateData, null, 2))
        
        const { data: user, error } = await supabase
          .from('users')
          .update(updateData)
          .eq('external_id', event.data.id)  // Match by external_id (text), not id (uuid)
          .select('id, external_id, email, full_name, avatar_url, updated_at')
          .single()

        if (error) {
          console.error('❌ Error updating user:', JSON.stringify(error, null, 2))
          console.error('❌ Update data used:', JSON.stringify(updateData, null, 2))
          console.error('❌ Looking for external_id:', event.data.id)
          console.error('❌ Error code:', error.code)
          return new Response(JSON.stringify({ 
            error: error.message, 
            details: error,
            updateData: updateData 
          }), { status: 500 })
        }

        console.log('✅ User updated successfully:', user?.id)
        return new Response(JSON.stringify({ success: true, user }), { status: 200 })
      }

      case 'organization.created': {
        console.log('🏢 Processing organization.created for:', event.data.id)
        
        // Insert organization with correct schema matching clento-new-database.sql
        const orgData = {
          external_id: event.data.id,          // Clerk org ID -> external_id (text)
          name: event.data.name,               // Required field
          slug: event.data.slug || null,       // Optional field
          logo_url: event.data.image_url || null,  // Clerk uses image_url for orgs
          // Note: id (uuid), created_at, updated_at, created_by_auth_id are auto-generated/optional
        }
        
        console.log('💾 Inserting organization data:', JSON.stringify(orgData, null, 2))
        
        const { data: organization, error } = await supabase
          .from('organizations')
          .insert([orgData])
          .select()
          .single()

        if (error) {
          console.error('❌ Error creating organization:', JSON.stringify(error, null, 2))
          console.error('❌ Failed org data:', JSON.stringify(orgData, null, 2))
          return new Response(JSON.stringify({ error: error.message, details: error }), { status: 500 })
        }

        // Add creator as admin if we can find them
        if (event.data.created_by) {
          console.log('👥 Adding creator as admin:', event.data.created_by)
          
          const { data: creator } = await supabase
            .from('users')
            .select('id')
            .eq('external_id', event.data.created_by)
            .single()

          if (creator) {
            const membershipData = {
              organization_id: organization.id,
              user_id: creator.id,
              role: 'admin',
              status: 'active',
            }
            
            console.log('👥 Adding membership:', JSON.stringify(membershipData, null, 2))
            
            const { error: memberError } = await supabase
              .from('organization_members')  // Correct table name
              .insert([membershipData])

            if (memberError) {
              console.error('❌ Error adding creator as admin:', JSON.stringify(memberError, null, 2))
            } else {
              console.log('✅ Creator added as admin to organization')
            }
          } else {
            console.log('⚠️ Creator not found in database:', event.data.created_by)
          }
        }

        console.log('✅ Organization created successfully:', organization.id)
        return new Response(JSON.stringify({ success: true, organization }), { status: 200 })
      }

      case 'organization.updated': {
        console.log('🏢 Processing organization.updated for:', event.data.id)
        
        const updateData = {
          name: event.data.name,
          slug: event.data.slug || null,
          logo_url: event.data.image_url || null,
          updated_at: new Date().toISOString(),
        }
        
        console.log('💾 Updating organization data:', JSON.stringify(updateData, null, 2))
        console.log('🔍 Looking for organization with external_id:', event.data.id)
        
        const { data: organization, error } = await supabase
          .from('organizations')
          .update(updateData)
          .eq('external_id', event.data.id)  // Match by external_id (text), not id (uuid)
          .select()
          .single()

        if (error) {
          console.error('❌ Error updating organization:', JSON.stringify(error, null, 2))
          console.error('❌ Update data used:', JSON.stringify(updateData, null, 2))
          console.error('❌ Looking for external_id:', event.data.id)
          return new Response(JSON.stringify({ error: error.message, details: error }), { status: 500 })
        }

        console.log('✅ Organization updated successfully:', organization?.id)
        return new Response(JSON.stringify({ success: true, organization }), { status: 200 })
      }

      case 'organizationMembership.created': {
        console.log('👥 Processing organizationMembership.created')
        
        // Get the user and organization from our database
        const [userResult, orgResult] = await Promise.all([
          supabase.from('users').select('id').eq('external_id', event.data.public_user_data?.user_id).single(),
          supabase.from('organizations').select('id').eq('external_id', event.data.organization?.id).single()
        ])

        if (userResult.error) {
          console.error('❌ User not found for membership:', event.data.public_user_data?.user_id)
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 })
        }

        if (orgResult.error) {
          console.error('❌ Organization not found for membership:', event.data.organization?.id)
          return new Response(JSON.stringify({ error: 'Organization not found' }), { status: 404 })
        }

        // Insert membership record
        const { data: membership, error } = await supabase
          .from('organization_members')  // Correct table name
          .insert([
            {
              organization_id: orgResult.data.id,
              user_id: userResult.data.id,
              role: event.data.role || 'member',
              status: 'active',
            },
          ])
          .select()
          .single()

        if (error) {
          console.error('❌ Error creating membership:', error)
          return new Response(JSON.stringify({ error: error.message }), { status: 500 })
        }

        console.log('✅ Membership created successfully')
        return new Response(JSON.stringify({ success: true, membership }), { status: 200 })
      }

      case 'organizationMembership.updated': {
        console.log('👥 Processing organizationMembership.updated')
        
        const [userResult, orgResult] = await Promise.all([
          supabase.from('users').select('id').eq('external_id', event.data.public_user_data?.user_id).single(),
          supabase.from('organizations').select('id').eq('external_id', event.data.organization?.id).single()
        ])

        if (userResult.error || orgResult.error) {
          console.error('❌ User or organization not found for membership update')
          return new Response(JSON.stringify({ error: 'User or organization not found' }), { status: 404 })
        }

        const { data: membership, error } = await supabase
          .from('organization_members')  // Correct table name
          .update({
            role: event.data.role || 'member',
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', orgResult.data.id)
          .eq('user_id', userResult.data.id)
          .select()
          .single()

        if (error) {
          console.error('❌ Error updating membership:', error)
          return new Response(JSON.stringify({ error: error.message }), { status: 500 })
        }

        console.log('✅ Membership updated successfully')
        return new Response(JSON.stringify({ success: true, membership }), { status: 200 })
      }

      case 'organizationMembership.deleted': {
        console.log('👥 Processing organizationMembership.deleted')
        
        const [userResult, orgResult] = await Promise.all([
          supabase.from('users').select('id').eq('external_id', event.data.public_user_data?.user_id).single(),
          supabase.from('organizations').select('id').eq('external_id', event.data.organization?.id).single()
        ])

        if (userResult.error || orgResult.error) {
          console.error('❌ User or organization not found for membership deletion')
          return new Response(JSON.stringify({ error: 'User or organization not found' }), { status: 404 })
        }

        const { error } = await supabase
          .from('organization_members')  // Correct table name
          .delete()
          .eq('organization_id', orgResult.data.id)
          .eq('user_id', userResult.data.id)

        if (error) {
          console.error('❌ Error deleting membership:', error)
          return new Response(JSON.stringify({ error: error.message }), { status: 500 })
        }

        console.log('✅ Membership deleted successfully')
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }

      default: {
        console.log('ℹ️ Unhandled event type:', event.type)
        return new Response(JSON.stringify({ success: true, message: 'Event received but not handled' }), { status: 200 })
      }
    }
  } catch (error) {
    console.error('💥 Webhook processing error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
})
