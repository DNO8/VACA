// @ts-nocheck
// Supabase Edge Function: vaquita-feed
// Feed público de señales para el mapa web de Vaquitas.
//
// Privacidad: las coordenadas se fuzzean a ~1.1 km (2 decimales) y NO se
// exponen nota, clave del dispositivo ni datos de identidad. El mapa público
// nunca muestra la posición exacta de una emergencia.

import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

// Estados locales que no deben aparecer como señales vivas en el mapa.
const CLOSED_STATUSES = new Set([
  'cancelled',
  'cancelledLocally',
  'cancellationQueued',
  'cancellationReceived',
  'expired',
]);

const FUZZ_DECIMALS = 2; // ~1.1 km — decision pendiente: geohash/comuna.

function fuzz(value: number | null): number | null {
  if (value == null) return null;
  const factor = 10 ** FUZZ_DECIMALS;
  return Math.round(value * factor) / factor;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'server_not_configured' }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from('incidents')
    .select(
      'incident_id, category, priority, people_count, latitude, longitude, ' +
        'status, donation_status, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return jsonResponse({ error: 'feed_failed' }, 500);

  const incidents = (data ?? [])
    .filter((row) => !CLOSED_STATUSES.has(row.status))
    .map((row) => ({
      id: row.incident_id,
      category: row.category,
      priority: row.priority,
      peopleCount: row.people_count,
      latitude: fuzz(row.latitude),
      longitude: fuzz(row.longitude),
      status: row.status,
      donationStatus: row.donation_status,
      createdAt: row.created_at,
    }));

  return jsonResponse({ incidents }, 200);
});
