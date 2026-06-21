// Datos simulados de catástrofes y necesidades por región de Chile (demo V.A.C.A.)

export type Severity = 'critico' | 'alto' | 'medio';

export interface NeedItem {
  code: string;        // codigo de asset Stellar (<=12 chars)
  label: string;       // nombre legible
  unit: string;        // unidad
  target: number;      // unidades requeridas
  usdcPerUnit: number; // costo estimado por unidad (USDC)
}

export interface RegionDisaster {
  regionId: number;
  disaster: string;
  severity: Severity;
  affected: number;       // personas damnificadas
  summary: string;
  needs: NeedItem[];
  reports: number;        // reportes comunitarios capturados (catastro offline)
  confidence: number;     // nivel de "verdad emergente" 0-100 antes de validar
}

export const SEVERITY_COLOR: Record<Severity, string> = {
  critico: '#FF6B9D', // Y2K neon pink — alerta máxima
  alto: '#DBA59E',    // terracota polvorienta
  medio: '#B8D9C6',   // verde celadón
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critico: 'Crítico',
  alto: 'Alto',
  medio: 'Medio',
};

// Catastrofes activas (regionId = COD_REGI del GeoJSON)
export const DISASTERS: RegionDisaster[] = [
  {
    regionId: 5,
    disaster: 'Incendios forestales',
    severity: 'critico',
    affected: 19000,
    summary:
      'Incendios de rápida propagación en sectores de Viña del Mar y Quilpué. Pérdida masiva de viviendas y corte de servicios básicos.',
    reports: 1280,
    confidence: 82,
    needs: [
      { code: 'AGUA', label: 'Agua potable (bidón 20L)', unit: 'bidón', target: 8000, usdcPerUnit: 4 },
      { code: 'KITHAB', label: 'Kit de habitabilidad de emergencia', unit: 'kit', target: 2500, usdcPerUnit: 35 },
      { code: 'COLCHON', label: 'Colchón + frazadas', unit: 'set', target: 4000, usdcPerUnit: 22 },
      { code: 'ALIMENTO', label: 'Caja de alimentos (familia/semana)', unit: 'caja', target: 6000, usdcPerUnit: 18 },
    ],
  },
  {
    regionId: 8,
    disaster: 'Incendios forestales',
    severity: 'alto',
    affected: 7400,
    summary:
      'Focos activos en zonas rurales de Biobío. Comunidades aisladas requieren agua, alimento y atención médica básica.',
    reports: 540,
    confidence: 68,
    needs: [
      { code: 'AGUA', label: 'Agua potable (bidón 20L)', unit: 'bidón', target: 5000, usdcPerUnit: 4 },
      { code: 'MEDIC', label: 'Botiquín médico de emergencia', unit: 'botiquín', target: 800, usdcPerUnit: 28 },
      { code: 'ALIMENTO', label: 'Caja de alimentos (familia/semana)', unit: 'caja', target: 3500, usdcPerUnit: 18 },
    ],
  },
  {
    regionId: 9,
    disaster: 'Inundaciones',
    severity: 'alto',
    affected: 5200,
    summary:
      'Desbordes de ríos en La Araucanía dejan viviendas anegadas y familias desplazadas a albergues temporales.',
    reports: 410,
    confidence: 71,
    needs: [
      { code: 'KITHAB', label: 'Kit de habitabilidad de emergencia', unit: 'kit', target: 1500, usdcPerUnit: 35 },
      { code: 'COLCHON', label: 'Colchón + frazadas', unit: 'set', target: 2000, usdcPerUnit: 22 },
      { code: 'AGUA', label: 'Agua potable (bidón 20L)', unit: 'bidón', target: 3000, usdcPerUnit: 4 },
    ],
  },
  {
    regionId: 7,
    disaster: 'Inundaciones',
    severity: 'medio',
    affected: 2100,
    summary:
      'Sistema frontal provoca anegamientos en zonas bajas del Maule. Necesidad de abrigo y limpieza.',
    reports: 190,
    confidence: 58,
    needs: [
      { code: 'COLCHON', label: 'Colchón + frazadas', unit: 'set', target: 1200, usdcPerUnit: 22 },
      { code: 'LIMPIEZA', label: 'Kit de limpieza post-inundación', unit: 'kit', target: 900, usdcPerUnit: 15 },
    ],
  },
  {
    regionId: 2,
    disaster: 'Aluvión',
    severity: 'medio',
    affected: 1600,
    summary:
      'Aluvión por lluvias altiplánicas afecta sectores de Antofagasta. Daños en infraestructura y viviendas.',
    reports: 150,
    confidence: 54,
    needs: [
      { code: 'AGUA', label: 'Agua potable (bidón 20L)', unit: 'bidón', target: 2500, usdcPerUnit: 4 },
      { code: 'KITHAB', label: 'Kit de habitabilidad de emergencia', unit: 'kit', target: 600, usdcPerUnit: 35 },
    ],
  },
  {
    regionId: 10,
    disaster: 'Erupción volcánica (alerta)',
    severity: 'medio',
    affected: 900,
    summary:
      'Aumento de actividad volcánica obliga a evacuaciones preventivas en Los Lagos. Albergues activos.',
    reports: 95,
    confidence: 49,
    needs: [
      { code: 'ALIMENTO', label: 'Caja de alimentos (familia/semana)', unit: 'caja', target: 1500, usdcPerUnit: 18 },
      { code: 'MEDIC', label: 'Botiquín médico de emergencia', unit: 'botiquín', target: 300, usdcPerUnit: 28 },
    ],
  },
];

// Nombres por COD_REGI (coinciden con public/chile-regions.geojson)
export const REGION_NAMES: Record<number, string> = {
  15: 'Arica y Parinacota',
  1: 'Tarapacá',
  2: 'Antofagasta',
  3: 'Atacama',
  4: 'Coquimbo',
  5: 'Valparaíso',
  13: 'Metropolitana de Santiago',
  6: "O'Higgins",
  7: 'Maule',
  8: 'Biobío',
  9: 'La Araucanía',
  14: 'Los Ríos',
  10: 'Los Lagos',
  11: 'Aysén',
  12: 'Magallanes',
};

export function getDisaster(regionId: number): RegionDisaster | undefined {
  return DISASTERS.find((d) => d.regionId === regionId);
}

export function needTotalUsdc(n: NeedItem): number {
  return n.target * n.usdcPerUnit;
}
