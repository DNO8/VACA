'use client';

import { useEffect, useRef, useState, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DISASTERS, SEVERITY_COLOR } from '@/lib/chile';

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Vista del globo (mundo) y vista enfocada a Chile
const GLOBE_VIEW = { center: [-30, 5] as [number, number], zoom: 1.6, pitch: 0, bearing: 0 };
const CHILE_VIEW = { center: [-71, -38] as [number, number], zoom: 3.9, pitch: 25, bearing: 0 };

interface VacaGlobeProps {
  started: boolean;
  selectedRegionId: number | null;
  onRegionClick: (regionId: number, name: string, center: [number, number]) => void;
  onReady?: () => void;
}

const DISASTER_IDS = new Set(DISASTERS.map((d) => d.regionId));

function VacaGlobe({ started, selectedRegionId, onRegionClick, onReady }: VacaGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const hoveredId = useRef<number | null>(null);
  const clickHandler = useRef(onRegionClick);
  clickHandler.current = onRegionClick;

  // ── Init map ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: GLOBE_VIEW.center,
        zoom: GLOBE_VIEW.zoom,
        attributionControl: false,
      });
    } catch (e) {
      console.error('[VACA] No se pudo inicializar el mapa (WebGL?):', e);
      return;
    }
    mapRef.current = map;

    map.on('load', async () => {
      try {
        map.setProjection({ type: 'globe' });
      } catch {
        /* globe no soportado */
      }
      try {
        map.setSky({
          'sky-color': '#04040A',
          'sky-horizon-blend': 0.5,
          'horizon-color': '#0a0f1f',
          'horizon-fog-blend': 0.4,
          'fog-color': '#04040A',
          'fog-ground-blend': 0.85,
        });
      } catch {
        /* sky opcional */
      }

      // ── Cargar regiones ──
      let geo: any;
      try {
        geo = await fetch('/chile-regions.geojson').then((r) => r.json());
      } catch (e) {
        console.error('[VACA] No se pudo cargar chile-regions.geojson', e);
        return;
      }

      // Enriquecer features con severidad/estado de catástrofe
      geo.features.forEach((f: any) => {
        const d = DISASTERS.find((x) => x.regionId === f.properties.regionId);
        f.properties.hasDisaster = d ? 1 : 0;
        f.properties.color = d ? SEVERITY_COLOR[d.severity] : '#2a3142';
        f.id = f.properties.regionId;
      });

      map.addSource('regions', { type: 'geojson', data: geo, promoteId: 'regionId' });

      // Relleno de regiones
      map.addLayer({
        id: 'regions-fill',
        type: 'fill',
        source: 'regions',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.7,
            ['boolean', ['feature-state', 'hover'], false],
            0.55,
            ['==', ['get', 'hasDisaster'], 1],
            0.35,
            0.12,
          ],
        },
      });

      // Borde de regiones
      map.addLayer({
        id: 'regions-line',
        type: 'line',
        source: 'regions',
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'hasDisaster'], 1],
            ['get', 'color'],
            '#3a4050',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            2.4,
            ['boolean', ['feature-state', 'hover'], false],
            1.6,
            0.7,
          ],
          'line-opacity': 0.9,
        },
      });

      // ── Focos de catástrofe (puntos) ──
      const fociFeatures = DISASTERS.map((d) => {
        const region = geo.features.find((f: any) => f.properties.regionId === d.regionId);
        const center = region?.properties?.center ?? [-71, -38];
        return {
          type: 'Feature',
          properties: { regionId: d.regionId, color: SEVERITY_COLOR[d.severity] },
          geometry: { type: 'Point', coordinates: center },
        };
      });
      map.addSource('foci', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: fociFeatures } as any,
      });
      map.addLayer({
        id: 'foci-pulse',
        type: 'circle',
        source: 'foci',
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.25,
          'circle-blur': 0.6,
        },
      });
      map.addLayer({
        id: 'foci-core',
        type: 'circle',
        source: 'foci',
        paint: {
          'circle-radius': 4,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      });

      // Animación de pulso
      let t = 0;
      const pulse = () => {
        t += 0.06;
        const r = 8 + Math.sin(t) * 6 + 6;
        const op = 0.35 - (Math.sin(t) * 0.5 + 0.5) * 0.3;
        if (map.getLayer('foci-pulse')) {
          map.setPaintProperty('foci-pulse', 'circle-radius', r);
          map.setPaintProperty('foci-pulse', 'circle-opacity', Math.max(0.05, op));
        }
        (map as any)._vacaPulse = requestAnimationFrame(pulse);
      };
      pulse();

      // ── Interacción ──
      const setHover = (id: number | null) => {
        if (hoveredId.current !== null) {
          map.setFeatureState({ source: 'regions', id: hoveredId.current }, { hover: false });
        }
        hoveredId.current = id;
        if (id !== null) {
          map.setFeatureState({ source: 'regions', id }, { hover: true });
        }
      };

      map.on('mousemove', 'regions-fill', (e) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = 'pointer';
        setHover(e.features[0].properties!.regionId as number);
      });
      map.on('mouseleave', 'regions-fill', () => {
        map.getCanvas().style.cursor = '';
        setHover(null);
      });
      map.on('click', 'regions-fill', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties!.regionId as number;
        const name = f.properties!.name as string;
        const center = (f.properties!.center as any) ?? [e.lngLat.lng, e.lngLat.lat];
        const c = typeof center === 'string' ? JSON.parse(center) : center;
        clickHandler.current(id, name, c);
      });
      map.on('click', 'foci-core', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties!.regionId as number;
        const d = DISASTERS.find((x) => x.regionId === id);
        const region = geo.features.find((g: any) => g.properties.regionId === id);
        const center = region?.properties?.center ?? [e.lngLat.lng, e.lngLat.lat];
        clickHandler.current(id, region?.properties?.name ?? '', center);
      });

      setReady(true);
      onReady?.();
    });

    return () => {
      if ((map as any)._vacaPulse) cancelAnimationFrame((map as any)._vacaPulse);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Volar a Chile cuando inicia la demo ──
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    if (started) {
      map.flyTo({ ...CHILE_VIEW, duration: 4000, essential: true });
    } else {
      map.flyTo({ ...GLOBE_VIEW, duration: 2500, essential: true });
    }
  }, [ready, started]);

  // ── Resaltar / volar a región seleccionada ──
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    // limpiar selección previa
    DISASTER_IDS.forEach((id) => map.setFeatureState({ source: 'regions', id }, { selected: false }));
    // reaplicar a todas las regiones conocidas no es trivial; limpiamos por id seleccionado
    if (selectedRegionId != null) {
      map.setFeatureState({ source: 'regions', id: selectedRegionId }, { selected: true });
    }
  }, [ready, selectedRegionId]);

  return <div ref={containerRef} className="absolute inset-0 h-full w-full" />;
}

export default memo(VacaGlobe);
