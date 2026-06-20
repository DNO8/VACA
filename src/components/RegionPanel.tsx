'use client';

import { useMemo, useState } from 'react';
import {
  X,
  Coins,
  HandHeart,
  ShieldCheck,
  ExternalLink,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Users,
  Radio,
  KeyRound,
  FileSearch,
} from 'lucide-react';
import {
  RegionDisaster,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  needTotalUsdc,
} from '@/lib/chile';
import {
  DemoAccounts,
  EmergencyWallet,
  createEmergencyWallet,
  tokenizeNeed,
  donateToEvent,
  releaseAid,
  claimBalance,
  explorerTx,
  explorerAccount,
} from '@/lib/stellar';

export interface TxEntry {
  label: string;
  hash: string;
  kind: 'validate' | 'wallet' | 'tokenize' | 'donate' | 'release' | 'claim';
  regionName: string;
}

interface RegionPanelProps {
  regionName: string;
  disaster: RegionDisaster | null;
  accounts: DemoAccounts | null;
  onClose: () => void;
  onTx: (entry: TxEntry) => void;
}

export default function RegionPanel({
  regionName,
  disaster,
  accounts,
  onClose,
  onTx,
}: RegionPanelProps) {
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');

  const [validated, setValidated] = useState(false);
  const [wallet, setWallet] = useState<EmergencyWallet | null>(null);
  const [tokenized, setTokenized] = useState<Record<string, string>>({});
  const [donateAmount, setDonateAmount] = useState(50);
  const [donatedTotal, setDonatedTotal] = useState(0);
  const [lastBalanceId, setLastBalanceId] = useState('');
  const [claimedTx, setClaimedTx] = useState('');

  const totalUsdc = useMemo(
    () => (disaster ? disaster.needs.reduce((s, n) => s + needTotalUsdc(n), 0) : 0),
    [disaster],
  );

  if (!disaster) {
    return (
      <Shell regionName={regionName} onClose={onClose} severityColor="#2a3142" badge="Sin alerta activa">
        <div className="flex flex-col items-center gap-3 py-10 text-center text-[var(--text-secondary)]">
          <ShieldCheck size={36} className="text-[var(--alert-green)]" />
          <p className="text-sm">
            Esta región no tiene una catástrofe activa en la simulación. Selecciona una región con
            foco rojo, naranjo o amarillo.
          </p>
        </div>
      </Shell>
    );
  }

  const busyStep = getBusyStep(busyLabel);

  const color = SEVERITY_COLOR[disaster.severity];
  const confidence = validated ? 100 : disaster.confidence;

  async function run(label: string, fn: () => Promise<void>) {
    if (!accounts) {
      setError('Las cuentas de demostración aún se inicializan. Espera unos segundos.');
      return;
    }
    setError('');
    setBusy(true);
    setBusyLabel(label);
    try {
      await fn();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Error en la transacción Stellar.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  const handleValidate = () =>
    run('Cruzando reportes comunitarios…', async () => {
      // "Verdad emergente": validación off-chain del catastro distribuido
      await new Promise((r) => setTimeout(r, 900));
      setValidated(true);
    });

  const handleCreateWallet = () =>
    run('Creando wallet multifirma 2-de-2…', async () => {
      const w = await createEmergencyWallet(accounts!);
      setWallet(w);
      onTx({
        label: 'Wallet multifirma del evento (2-de-2)',
        hash: w.setupTxHash,
        kind: 'wallet',
        regionName,
      });
    });

  const handleTokenize = (code: string, amount: number) =>
    run(`Tokenizando ${code}…`, async () => {
      const res = await tokenizeNeed(accounts!, code, amount);
      setTokenized((t) => ({ ...t, [code]: res.txHash }));
      onTx({ label: `Tokenizó ${amount} ${code}`, hash: res.txHash, kind: 'tokenize', regionName });
    });

  const handleDonate = () =>
    run('Donando USDC al pool del evento…', async () => {
      const res = await donateToEvent(accounts!, wallet!.publicKey, donateAmount);
      setDonatedTotal((d) => d + donateAmount);
      onTx({
        label: `Donó ${donateAmount} USDC al pool`,
        hash: res.txHash,
        kind: 'donate',
        regionName,
      });
    });

  const handleRelease = () =>
    run('Liberando ayuda (firma 2-de-2)…', async () => {
      const amount = Math.max(1, donatedTotal);
      const rel = await releaseAid(accounts!, wallet!.secret, amount);
      setLastBalanceId(rel.balanceId);
      onTx({
        label: `Liberó ${amount} USDC (Plataforma + Municipalidad)`,
        hash: rel.txHash,
        kind: 'release',
        regionName,
      });
      const claim = await claimBalance(accounts!, rel.balanceId);
      setClaimedTx(claim.txHash);
      setLastBalanceId('');
      onTx({
        label: 'Beneficiario reclamó la ayuda (Proof of Aid)',
        hash: claim.txHash,
        kind: 'claim',
        regionName,
      });
    });

  return (
    <Shell
      regionName={regionName}
      onClose={onClose}
      severityColor={color}
      badge={`${disaster.disaster} · ${SEVERITY_LABEL[disaster.severity]}`}
    >
      {/* Resumen */}
      <div className="space-y-2 md:space-y-3">
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] md:text-sm">
          <Users size={15} style={{ color }} />
          <span>
            <strong className="text-[var(--text-primary)]">
              {disaster.affected.toLocaleString('es-CL')}
            </strong>{' '}
            personas damnificadas
          </span>
        </div>
        <p className="text-[12px] leading-relaxed text-[var(--text-secondary)] md:text-[13px]">{disaster.summary}</p>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-[rgba(255,61,61,0.4)] bg-[rgba(255,61,61,0.1)] p-2 text-xs text-[#ffb4b4]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 0. Verdad emergente */}
      <Section icon={<FileSearch size={15} />} title="1 · Catastro · Verdad emergente" accent={color} dataTour="catastro">
        <div className="mb-2 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <Radio size={12} className="text-[var(--cyan-primary)]" />
            {disaster.reports.toLocaleString('es-CL')} reportes comunitarios
          </span>
          <span style={{ color: validated ? 'var(--alert-green)' : color }}>
            Confianza {confidence}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${confidence}%`, background: validated ? 'var(--alert-green)' : color }}
          />
        </div>
        {validated ? (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--alert-green)]">
            <CheckCircle2 size={13} /> Catastro validado · capa de ayuda activada
          </div>
        ) : (
          <button
            onClick={handleValidate}
            disabled={busy}
            className="mt-2 w-full rounded-md border border-[var(--border-active)] py-2 text-[12px] font-semibold text-[var(--gold-light)] transition hover:bg-[var(--hover-accent)] disabled:opacity-40 md:py-1.5 md:text-[11px]"
          >
            Validar catastro comunitario
          </button>
        )}
        {busyStep === 1 && <BusyNotice label={busyLabel} />}
      </Section>

      {/* 2. Wallet multifirma */}
      <Section icon={<KeyRound size={15} />} title="2 · Wallet multifirma del evento" accent={color} disabled={!validated} dataTour="wallet">
        <p className="mb-2 text-[11px] text-[var(--text-muted)]">
          Cada evento tiene su propia cuenta <strong>2-de-2</strong>: requiere firma de la Plataforma
          y la Municipalidad para liberar fondos (anti-fraude).
        </p>
        {wallet ? (
          <a
            href={explorerAccount(wallet.publicKey)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 rounded-md border border-[rgba(0,230,118,0.4)] bg-[rgba(0,230,118,0.1)] px-2 py-1.5 text-[11px] font-semibold text-[var(--alert-green)]"
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Cuenta 2-de-2 activa
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px]">
              {wallet.publicKey.slice(0, 4)}…{wallet.publicKey.slice(-4)} <ExternalLink size={11} />
            </span>
          </a>
        ) : (
          <button
            onClick={handleCreateWallet}
            disabled={busy || !validated}
            className="w-full rounded-md border border-[var(--border-active)] py-2 text-[12px] font-semibold text-[var(--gold-light)] transition hover:bg-[var(--hover-accent)] disabled:opacity-40 md:py-1.5 md:text-[11px]"
          >
            Activar wallet multifirma
          </button>
        )}
        {busyStep === 2 && <BusyNotice label={busyLabel} />}
      </Section>

      {/* 3. Tokenizar necesidades */}
      <Section icon={<Coins size={15} />} title="3 · Tokenizar necesidades" accent={color} disabled={!validated} dataTour="tokenize">
        <p className="mb-2 text-[11px] text-[var(--text-muted)]">
          La institución convierte cada necesidad en un asset en Stellar Testnet.
        </p>
        <div className="space-y-2">
          {disaster.needs.map((n) => {
            const done = tokenized[n.code];
            return (
              <div
                key={n.code}
                className="flex flex-col gap-2 rounded-md border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-[var(--text-primary)]">{n.label}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {n.target.toLocaleString('es-CL')} {n.unit} · {n.code}
                  </div>
                </div>
                {done ? (
                  <a
                    href={explorerTx(done)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex shrink-0 items-center justify-center gap-1 rounded px-2 py-1.5 text-[11px] font-semibold text-[var(--alert-green)] sm:py-1"
                  >
                    <CheckCircle2 size={13} /> Emitido <ExternalLink size={11} />
                  </a>
                ) : (
                  <button
                    onClick={() => handleTokenize(n.code, n.target)}
                    disabled={busy || !validated}
                    className="shrink-0 rounded border border-[var(--border-active)] px-3 py-1.5 text-[12px] font-semibold text-[var(--gold-light)] transition hover:bg-[var(--hover-accent)] disabled:opacity-40 sm:px-2.5 sm:py-1 sm:text-[11px]"
                  >
                    Tokenizar
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {busyStep === 3 && <BusyNotice label={busyLabel} />}
      </Section>

      {/* 4. Donar */}
      <Section icon={<HandHeart size={15} />} title="4 · Donar USDC al pool" accent={color} disabled={!wallet} dataTour="donate">
        <p className="mb-2 text-[11px] text-[var(--text-muted)]">
          Necesidad total estimada:{' '}
          <strong className="text-[var(--text-primary)]">
            {totalUsdc.toLocaleString('es-CL')} USDC
          </strong>
          . Tu donación entra al pool multifirma del evento.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-md border border-[var(--border-secondary)] bg-[var(--bg-secondary)] px-2">
            <input
              type="number"
              min={1}
              value={donateAmount}
              onChange={(e) => setDonateAmount(Math.max(1, Number(e.target.value)))}
              disabled={!wallet}
              className="w-full bg-transparent py-1.5 text-sm text-[var(--text-primary)] outline-none"
            />
            <span className="text-[11px] text-[var(--text-muted)]">USDC</span>
          </div>
          <button
            onClick={handleDonate}
            disabled={busy || !wallet}
            className="rounded-md px-4 py-2 text-[13px] font-bold text-[#04040A] transition disabled:opacity-40 md:px-3 md:py-1.5 md:text-[12px]"
            style={{ background: color }}
          >
            Donar
          </button>
        </div>
        {donatedTotal > 0 && (
          <div className="mt-2 text-[11px] text-[var(--alert-green)]">
            Pool del evento: {donatedTotal.toLocaleString('es-CL')} USDC
          </div>
        )}
        {busyStep === 4 && <BusyNotice label={busyLabel} />}
      </Section>

      {/* 5. Liberar + Proof of Aid */}
      <Section icon={<ShieldCheck size={15} />} title="5 · Liberar + Proof of Aid" accent={color} disabled={donatedTotal === 0} dataTour="proof">
        <p className="mb-2 text-[11px] text-[var(--text-muted)]">
          Liberación con <strong>doble firma</strong> (Plataforma + Municipalidad) → Claimable
          Balance → el beneficiario reclama. Genera la prueba de entrega.
        </p>
        {claimedTx ? (
          <a
            href={explorerTx(claimedTx)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-md border border-[rgba(0,230,118,0.4)] bg-[rgba(0,230,118,0.1)] py-2 text-[12px] font-semibold text-[var(--alert-green)]"
          >
            <CheckCircle2 size={14} /> Proof of Aid registrado <ExternalLink size={12} />
          </a>
        ) : (
          <button
            onClick={handleRelease}
            disabled={busy || donatedTotal === 0}
            className="w-full rounded-md border border-[var(--border-active)] py-2.5 text-[13px] font-bold text-[var(--gold-light)] transition hover:bg-[var(--hover-accent)] disabled:opacity-40 md:py-2 md:text-[12px]"
          >
            {donatedTotal > 0 ? 'Liberar y entregar ayuda (2-de-2)' : 'Primero realiza una donación'}
          </button>
        )}
        {busyStep === 5 && <BusyNotice label={busyLabel} />}
      </Section>
    </Shell>
  );
}

function Shell({
  regionName,
  badge,
  severityColor,
  onClose,
  children,
}: {
  regionName: string;
  badge: string;
  severityColor: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-auto flex h-full w-full flex-col overflow-hidden border-l border-[var(--border-primary)] bg-[var(--bg-panel)] backdrop-blur-xl">
      <div
        data-tour="panel-header"
        className="relative shrink-0 border-b border-[var(--border-primary)] p-3 md:p-4"
        style={{ boxShadow: `inset 0 2px 0 ${severityColor}` }}
      >
        <button
          onClick={onClose}
          className="absolute right-2 top-2 rounded p-2 text-[var(--text-muted)] transition hover:bg-[var(--hover-accent)] hover:text-[var(--text-primary)] md:right-3 md:top-3 md:p-1"
          aria-label="Cerrar panel"
        >
          <X size={22} className="md:hidden" />
          <X size={18} className="hidden md:block" />
        </button>
        <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] md:text-[11px]">
          Región de Chile
        </div>
        <h2 className="mt-0.5 pr-8 text-base font-bold text-[var(--text-heading)] md:text-lg">{regionName}</h2>
        <span
          className="mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold md:px-2.5 md:text-[11px]"
          style={{
            background: `${severityColor}22`,
            color: severityColor,
            border: `1px solid ${severityColor}55`,
          }}
        >
          {badge}
        </span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3 pb-24 md:space-y-4 md:p-4 md:pb-16">{children}</div>
    </div>
  );
}

function BusyNotice({ label }: { label: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border border-[var(--border-cyan)] bg-[var(--cyan-glow)] p-2 text-xs text-[var(--text-cyan)]">
      <Loader2 size={14} className="animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function getBusyStep(label: string): number | null {
  if (label.includes('reportes')) return 1;
  if (label.includes('wallet')) return 2;
  if (label.includes('Tokenizando')) return 3;
  if (label.includes('Donando')) return 4;
  if (label.includes('Liberando')) return 5;
  return null;
}

function Section({
  icon,
  title,
  accent,
  disabled,
  dataTour,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  disabled?: boolean;
  dataTour?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-tour={dataTour}
      className={`rounded-lg border border-[var(--border-secondary)] bg-[rgba(255,255,255,0.02)] p-2.5 transition md:p-3 ${
        disabled ? 'pointer-events-none opacity-45' : ''
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[var(--text-primary)] md:text-[13px]">
        <span style={{ color: accent }}>{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}
