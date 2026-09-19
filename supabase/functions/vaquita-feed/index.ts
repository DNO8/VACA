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
const JITTER_MAX = 0.004; // <= ~450 m, siempre dentro de la celda de fuzz

function fuzz(value: number | null): number | null {
  if (value == null) return null;
  const factor = 10 ** FUZZ_DECIMALS;
  return Math.round(value * factor) / factor;
}

// Jitter determinístico (FNV-1a sobre incident_id): mismo incidente siempre
// en el mismo offset, dentro de su celda fuzzeada. Evita que señales del
// mismo lugar se apilen en un solo punto visual sin reducir privacidad.
function jitterFor(id: string): [number, number] {
  const fnv = (seed: number, forward: boolean) => {
    let h = seed;
    const n = id.length;
    for (let k = 0; k < n; k++) {
      const c = forward ? k : n - 1 - k;
      h ^= id.charCodeAt(c);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };
  const angle = (fnv(0x811c9dc5, true) / 0xffffffff) * 2 * Math.PI;
  const dist = Math.sqrt(fnv(0x9e3779b9, false) / 0xffffffff) * JITTER_MAX;
  return [Math.cos(angle) * dist, Math.sin(angle) * dist];
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
    .map((row) => {
      const lat = fuzz(row.latitude);
      const lng = fuzz(row.longitude);
      const [dx, dy] = lat != null && lng != null
        ? jitterFor(row.incident_id)
        : [0, 0];
      return {
        id: row.incident_id,
        category: row.category,
        priority: row.priority,
        peopleCount: row.people_count,
        latitude: lat != null ? lat + dy : null,
        longitude: lng != null ? lng + dx : null,
        status: row.status,
        donationStatus: row.donation_status,
        createdAt: row.created_at,
      };
    });

  return jsonResponse({ incidents }, 200);
});
