import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Note: In a real backend, we should use the SERVICE_ROLE_KEY to bypass RLS.
// However, since we are in a demo environment and likely don't have the service key in .env.local yet,
// we will use the ANON_KEY.
// If RLS is enabled on 'projects', this might fail unless we have the user's access_token.
// We will accept access_token to scope the client.

export const createAgentSupabaseClient = (accessToken?: string) => {
  const options: any = {};
  if (accessToken) {
    options.global = {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    };
  }
  return createClient(supabaseUrl, supabaseKey, options);
};

export async function saveProjectState(userId: string, projectJson: any, accessToken?: string, existingProjectId?: string) {
  const supabase = createAgentSupabaseClient(accessToken);
  
  const name = projectJson.branding?.name || 'Untitled Project';
  
  let projectId = existingProjectId;

  if (!projectId) {
      // Try to find by name if no ID provided
      const { data: existing } = await supabase
        .from('shpitto_projects')
        .select('id')
        .eq('tenant_id', userId)
        .eq('source_app', 'shpitto') // Filter by source app
        .eq('name', name)
        .single();
      
      if (existing) projectId = existing.id;
  }

  if (projectId) {
    // Update
    await supabase
      .from('shpitto_projects')
      .update({
        config: projectJson,
        name: name, // Update name in case it changed
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)
      .eq('source_app', 'shpitto'); // Security measure
  } else {
    // Insert
    const { data: newProject, error } = await supabase
      .from('shpitto_projects')
      .insert({
        id: crypto.randomUUID(),
        tenant_id: userId,
        source_app: 'shpitto',
        name: name,
        config: projectJson,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();
      
    if (error) {
        console.error("Failed to create project:", error);
        throw error;
    }
    projectId = newProject.id;
  }

  return projectId;
}

export async function recordDeployment(projectId: string, url: string, environment: string = 'production', accessToken?: string) {
  const supabase = createAgentSupabaseClient(accessToken);
  
  await supabase
    .from('shpitto_deployments')
    .insert({
      id: crypto.randomUUID(),
      project_id: projectId,
      environment,
      status: 'success',
      url,
      created_at: new Date().toISOString()
    });
}
