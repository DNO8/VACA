// Capa de integración Stellar para la demo V.A.C.A. (Testnet, sin wallet)
// Usa cuentas efímeras fondeadas por friendbot y firma en el navegador.
import {
  Keypair,
  Horizon,
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  Claimant,
  BASE_FEE,
} from '@stellar/stellar-sdk';

// Evento de emergencia: wallet multifirma 2-de-2 (Plataforma + Municipalidad)

export const HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const NETWORK = Networks.TESTNET;
const STORAGE_KEY = 'vaca-demo-accounts-v2';

export type Role = 'institution' | 'donor' | 'beneficiary';

export interface DemoAccounts {
  institution: string; // secret seeds (solo Testnet)
  donor: string;
  beneficiary: string;
  municipality: string; // co-firmante de la wallet del evento
}

export function explorerTx(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}
export function explorerAccount(pub: string): string {
  return `https://stellar.expert/explorer/testnet/account/${pub}`;
}

// ── Modo MOCK (solo para E2E): activa con ?mock=1, sin tocar la red ──
export function isMock(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('mock') === '1';
}
function fakeHash(): string {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 64; i++) s += hex[Math.floor(Math.random() * 16)];
  return s;
}
function fakePub(): string {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let s = 'G';
  for (let i = 0; i < 55; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
const mockDelay = () => new Promise((r) => setTimeout(r, 150));

let server: Horizon.Server | null = null;
export function getServer(): Horizon.Server {
  if (!server) server = new Horizon.Server(HORIZON_URL);
  return server;
}

// ── Friendbot ──
async function fundWithFriendbot(pub: string): Promise<void> {
  try {
    const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(pub)}`);
    if (!res.ok && res.status !== 400) {
      throw new Error(`friendbot ${res.status}`);
    }
  } catch (e) {
    // Puede fallar si ya está fondeada; lo ignoramos y verificamos luego.
    console.warn('[stellar] friendbot', e);
  }
}

async function ensureFunded(kp: Keypair): Promise<void> {
  const srv = getServer();
  try {
    await srv.loadAccount(kp.publicKey());
  } catch {
    await fundWithFriendbot(kp.publicKey());
    // Pequeña espera para propagación
    await new Promise((r) => setTimeout(r, 1500));
    await srv.loadAccount(kp.publicKey());
  }
}

// USDC de demostración emitido por la institución
export function usdcAsset(institutionPub: string): Asset {
  return new Asset('USDC', institutionPub);
}

// ── Setup de cuentas ──
export function loadStoredAccounts(): DemoAccounts | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as DemoAccounts) : null;
}

export function keypairs(acc: DemoAccounts) {
  return {
    institution: Keypair.fromSecret(acc.institution),
    donor: Keypair.fromSecret(acc.donor),
    beneficiary: Keypair.fromSecret(acc.beneficiary),
    municipality: Keypair.fromSecret(acc.municipality),
  };
}

// Construye, firma (con uno o varios firmantes) y envía una transacción.
async function submit(
  source: Keypair,
  buildOps: (b: TransactionBuilder) => void,
  extraSigners: Keypair[] = [],
): Promise<string> {
  const srv = getServer();
  const account = await srv.loadAccount(source.publicKey());
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK,
  });
  buildOps(builder);
  const tx = builder.setTimeout(60).build();
  tx.sign(source, ...extraSigners);
  const res = await srv.submitTransaction(tx);
  return res.hash;
}

export interface SetupResult {
  accounts: DemoAccounts;
  fundedTx: string; // hash del setup de USDC al donante
}

// Crea y fondea las 3 cuentas demo, emite USDC y lo entrega al donante.
export async function setupDemo(
  onStep?: (msg: string) => void,
): Promise<SetupResult> {
  const log = (m: string) => onStep?.(m);

  if (isMock()) {
    log('Generando cuentas Testnet (mock)…');
    await mockDelay();
    const accounts: DemoAccounts = {
      institution: 'MOCK', donor: 'MOCK', beneficiary: 'MOCK', municipality: 'MOCK',
    };
    return { accounts, fundedTx: fakeHash() };
  }

  let acc = loadStoredAccounts();
  let kp: { institution: Keypair; donor: Keypair; beneficiary: Keypair; municipality: Keypair };
  if (acc) {
    kp = keypairs(acc);
  } else {
    log('Generando cuentas Testnet…');
    const institution = Keypair.random();
    const donor = Keypair.random();
    const beneficiary = Keypair.random();
    const municipality = Keypair.random();
    acc = {
      institution: institution.secret(),
      donor: donor.secret(),
      beneficiary: beneficiary.secret(),
      municipality: municipality.secret(),
    };
    kp = { institution, donor, beneficiary, municipality };
  }

  log('Fondeando cuentas con friendbot…');
  await Promise.all([
    ensureFunded(kp.institution),
    ensureFunded(kp.donor),
    ensureFunded(kp.beneficiary),
    ensureFunded(kp.municipality),
  ]);

  const usdc = usdcAsset(kp.institution.publicKey());

  // ¿El donante ya tiene USDC? Si no, establecemos trustline y emitimos.
  let fundedTx = '';
  const donorAcc = await getServer().loadAccount(kp.donor.publicKey());
  const hasUsdc = donorAcc.balances.some(
    (b: any) => b.asset_code === 'USDC' && b.asset_issuer === kp.institution.publicKey(),
  );

  if (!hasUsdc) {
    log('Estableciendo línea de confianza USDC del donante…');
    await submit(kp.donor, (b) =>
      b.addOperation(Operation.changeTrust({ asset: usdc, limit: '1000000' })),
    );
    log('Emitiendo USDC de demostración al donante…');
    fundedTx = await submit(kp.institution, (b) =>
      b.addOperation(
        Operation.payment({ destination: kp.donor.publicKey(), asset: usdc, amount: '50000' }),
      ),
    );
  }

  if (typeof window !== 'undefined') {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(acc));
  }

  return { accounts: acc, fundedTx };
}

// ── Tokenizar una necesidad: la institución emite un asset al donante ──
export interface TokenizeResult {
  assetCode: string;
  amount: string;
  txHash: string;
}

export async function tokenizeNeed(
  acc: DemoAccounts,
  assetCode: string,
  amount: number,
): Promise<TokenizeResult> {
  if (isMock()) {
    await mockDelay();
    return { assetCode, amount: String(amount), txHash: fakeHash() };
  }
  const kp = keypairs(acc);
  const asset = new Asset(assetCode, kp.institution.publicKey());
  const amountStr = String(amount);

  // El donante confía en el asset (si aún no)
  const donorAcc = await getServer().loadAccount(kp.donor.publicKey());
  const trusts = donorAcc.balances.some(
    (b: any) => b.asset_code === assetCode && b.asset_issuer === kp.institution.publicKey(),
  );
  if (!trusts) {
    await submit(kp.donor, (b) =>
      b.addOperation(Operation.changeTrust({ asset, limit: '1000000000' })),
    );
  }

  // La institución emite (paga) el asset al donante → existe en la red
  const txHash = await submit(kp.institution, (b) =>
    b.addOperation(
      Operation.payment({ destination: kp.donor.publicKey(), asset, amount: amountStr }),
    ),
  );

  return { assetCode, amount: amountStr, txHash };
}

// ── Donar USDC: el donante crea un Claimable Balance para el beneficiario ──
export interface DonateResult {
  txHash: string;
  balanceId: string;
  amount: string;
}

export async function donateClaimable(
  acc: DemoAccounts,
  amountUsdc: number,
): Promise<DonateResult> {
  const kp = keypairs(acc);
  const usdc = usdcAsset(kp.institution.publicKey());
  const amountStr = amountUsdc.toFixed(2);

  const claimant = new Claimant(
    kp.beneficiary.publicKey(),
    Claimant.predicateUnconditional(),
  );

  const txHash = await submit(kp.donor, (b) =>
    b.addOperation(
      Operation.createClaimableBalance({
        asset: usdc,
        amount: amountStr,
        claimants: [claimant],
      }),
    ),
  );

  // Recuperar el balanceId recién creado para el beneficiario
  const srv = getServer();
  const cbs = await srv
    .claimableBalances()
    .claimant(kp.beneficiary.publicKey())
    .order('desc')
    .limit(1)
    .call();
  const balanceId = cbs.records[0]?.id ?? '';

  return { txHash, balanceId, amount: amountStr };
}

// ── Reclamar: el beneficiario confía en USDC y reclama el balance (Proof of Aid) ──
export interface ClaimResult {
  txHash: string;
  amount: string;
}

export async function claimBalance(
  acc: DemoAccounts,
  balanceId: string,
): Promise<ClaimResult> {
  if (isMock()) {
    await mockDelay();
    return { txHash: fakeHash(), amount: '' };
  }
  const kp = keypairs(acc);
  const usdc = usdcAsset(kp.institution.publicKey());

  const benAcc = await getServer().loadAccount(kp.beneficiary.publicKey());
  const trusts = benAcc.balances.some(
    (b: any) => b.asset_code === 'USDC' && b.asset_issuer === kp.institution.publicKey(),
  );

  const txHash = await submit(kp.beneficiary, (b) => {
    if (!trusts) {
      b.addOperation(Operation.changeTrust({ asset: usdc, limit: '1000000' }));
    }
    b.addOperation(Operation.claimClaimableBalance({ balanceId }));
  });

  // Monto reclamado
  return { txHash, amount: '' };
}

// ════════════════════════════════════════════════════════════════
//  Wallet multifirma del evento de emergencia (Diapositiva 5)
//  Cada evento tiene su propia cuenta 2-de-2: Plataforma + Municipalidad.
// ════════════════════════════════════════════════════════════════

export interface EmergencyWallet {
  publicKey: string;
  secret: string; // llave de la Plataforma (solo Testnet)
  setupTxHash: string;
}

// Crea la cuenta del evento, confía en USDC y la convierte en 2-de-2
// (Plataforma = llave maestra, Municipalidad = co-firmante).
export async function createEmergencyWallet(acc: DemoAccounts): Promise<EmergencyWallet> {
  if (isMock()) {
    await mockDelay();
    return { publicKey: fakePub(), secret: 'MOCK', setupTxHash: fakeHash() };
  }
  const kp = keypairs(acc);
  const usdc = usdcAsset(kp.institution.publicKey());
  const event = Keypair.random();

  await ensureFunded(event);

  // Trustline USDC (firma simple del evento, antes de activar multifirma)
  await submit(event, (b) =>
    b.addOperation(Operation.changeTrust({ asset: usdc, limit: '1000000' })),
  );

  // Activar multifirma 2-de-2: agrega a la Municipalidad como firmante
  // y exige peso 2 para operaciones (master weight 1 + municipalidad 1).
  const setupTxHash = await submit(event, (b) =>
    b.addOperation(
      Operation.setOptions({
        signer: { ed25519PublicKey: kp.municipality.publicKey(), weight: 1 },
        masterWeight: 1,
        lowThreshold: 2,
        medThreshold: 2,
        highThreshold: 2,
      }),
    ),
  );

  return { publicKey: event.publicKey(), secret: event.secret(), setupTxHash };
}

// El donante aporta USDC al pool multifirma del evento.
export async function donateToEvent(
  acc: DemoAccounts,
  eventPublicKey: string,
  amountUsdc: number,
): Promise<{ txHash: string; amount: string }> {
  if (isMock()) {
    await mockDelay();
    return { txHash: fakeHash(), amount: amountUsdc.toFixed(2) };
  }
  const kp = keypairs(acc);
  const usdc = usdcAsset(kp.institution.publicKey());
  const amountStr = amountUsdc.toFixed(2);

  const txHash = await submit(kp.donor, (b) =>
    b.addOperation(
      Operation.payment({ destination: eventPublicKey, asset: usdc, amount: amountStr }),
    ),
  );
  return { txHash, amount: amountStr };
}

// Libera ayuda desde el evento: requiere las 2 firmas (Plataforma + Municipalidad)
// y crea un Claimable Balance para el beneficiario.
export async function releaseAid(
  acc: DemoAccounts,
  eventSecret: string,
  amountUsdc: number,
): Promise<DonateResult> {
  if (isMock()) {
    await mockDelay();
    return { txHash: fakeHash(), balanceId: '0000' + fakeHash().slice(4), amount: amountUsdc.toFixed(2) };
  }
  const kp = keypairs(acc);
  const usdc = usdcAsset(kp.institution.publicKey());
  const event = Keypair.fromSecret(eventSecret);
  const amountStr = amountUsdc.toFixed(2);

  const claimant = new Claimant(
    kp.beneficiary.publicKey(),
    Claimant.predicateUnconditional(),
  );

  // Firma conjunta 2-de-2 (event = Plataforma, municipality = Municipalidad)
  const txHash = await submit(
    event,
    (b) =>
      b.addOperation(
        Operation.createClaimableBalance({
          asset: usdc,
          amount: amountStr,
          claimants: [claimant],
        }),
      ),
    [kp.municipality],
  );

  const srv = getServer();
  const cbs = await srv
    .claimableBalances()
    .claimant(kp.beneficiary.publicKey())
    .order('desc')
    .limit(1)
    .call();
  const balanceId = cbs.records[0]?.id ?? '';

  return { txHash, balanceId, amount: amountStr };
}
