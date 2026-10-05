import {
  hostileThreats,
  presentIncomingThreats,
  villageIncoming,
  type IncomingThreat,
} from './incoming-threats';
import { unitKeys, type CommanderView, type KingdomsView, type Mission, type Movement, type Troops, type Unit, type Village } from './types';

/**
 * Presentation over the existing village, movement, and incoming projections.
 * MISSING_ASSET — DEDICATED RALLY POINT ART
 * Readiness is derived for display and is never persisted.
 */

export const rallyReadinessLabels = {
  ready: 'جاهز',
  abroad: 'قوات بالخارج',
  threatened: 'تحت تهديد',
  training: 'قوات في التدريب',
} as const;

export type RallyReadiness = keyof typeof rallyReadinessLabels;

export const ownerMissionLabels: Record<Mission, string> = {
  attack: 'هجوم',
  raid: 'غارة',
  scout: 'استطلاع',
  reinforce: 'تعزيز',
  settle: 'تأسيس قرية',
  occupy: 'احتلال أرض',
  gather: 'جمع الموارد',
  return: 'عودة',
  intercept: 'اعتراض',
};

export const commanderStatusLabels: Record<CommanderView['status'], string> = {
  available: 'متاح',
  assigned: 'معيّن في القرية',
  marching: 'في حملة',
  deployed: 'متمركز خارج القرية',
};

export type RallyTroopRow = {
  unit: Unit;
  name: string;
  count: number;
  status: string;
};

export type RallyMovementRow = {
  id: string;
  mission: Mission;
  missionLabel: string;
  place: string;
  arrivesAt: number;
  status: string;
  commanderName?: string;
  troops?: RallyTroopRow[];
  loot?: Movement['loot'];
  mapVillageId?: string;
};

export type RallyCommand = {
  readiness: RallyReadiness;
  garrison: RallyTroopRow[];
  available: RallyTroopRow[];
  availableTotal: number;
  outgoing: RallyMovementRow[];
  returning: RallyMovementRow[];
  attacks: IncomingThreat[];
  incomingReinforcements: IncomingThreat[];
  stationedReinforcements: { sourceId: string; name: string; troops: RallyTroopRow[] }[];
  outgoingScouts: RallyMovementRow[];
  incomingScouts: IncomingThreat[];
  commanders: CommanderView[] | null;
  training: Village['training'];
  nearestThreat?: IncomingThreat;
  activeCampaigns: number;
  militaryReports: { id: string; title: string; at: number }[];
};

function troopRows(troops: Troops, config: KingdomsView['config'], status: string): RallyTroopRow[] {
  return unitKeys.map((unit) => ({
    unit,
    name: config.units[unit].name,
    count: troops[unit],
    status,
  }));
}

function placeName(view: KingdomsView, x: number, y: number) {
  return view.map.find((item) => item.x === x && item.y === y)?.name ?? `${x}، ${y}`;
}

function mapVillageId(view: KingdomsView, x: number, y: number) {
  return view.map.find((item) => item.x === x && item.y === y)?.id;
}

function commanderName(commanders: readonly CommanderView[] | undefined, id?: string) {
  if (!id || !commanders) return undefined;
  return commanders.find((commander) => commander.id === id)?.name;
}

function ownerRow(
  view: KingdomsView,
  movement: Movement,
  place: string,
  status: string,
  revealComposition: boolean,
): RallyMovementRow {
  const name = commanderName(view.commanders, movement.commanderId);
  return {
    id: movement.id,
    mission: movement.mission,
    missionLabel: ownerMissionLabels[movement.mission],
    place,
    arrivesAt: movement.arrivesAt,
    status,
    ...(name ? { commanderName: name } : {}),
    ...(revealComposition
      ? {
          troops: troopRows(movement.troops, view.config, status),
          loot: movement.loot,
        }
      : {}),
    ...(mapVillageId(view, movement.targetX, movement.targetY)
      ? { mapVillageId: mapVillageId(view, movement.targetX, movement.targetY) }
      : {}),
  };
}

export function deriveRallyReadiness(input: {
  hostile: number;
  training: boolean;
  abroad: number;
}): RallyReadiness {
  if (input.hostile > 0) return 'threatened';
  if (input.training) return 'training';
  if (input.abroad > 0) return 'abroad';
  return 'ready';
}

/** Groups the authoritative owner view. Incoming rows stay on the redacted threat contract. */
export function presentRallyCommand(view: KingdomsView, village: Village): RallyCommand {
  const ownedHere = view.movements.filter((movement) => movement.sourceId === village.id);
  const outgoing = ownedHere.filter(
    (movement) => movement.mission !== 'return' && movement.mission !== 'scout',
  );
  const outgoingScouts = ownedHere.filter((movement) => movement.mission === 'scout');
  const returning = view.movements.filter(
    (movement) =>
      movement.mission === 'return' &&
      movement.targetX === village.x &&
      movement.targetY === village.y,
  );
  const incoming = villageIncoming(
    presentIncomingThreats(view.incoming ?? [], view.serverNow),
    village.id,
  );
  const attacks = hostileThreats(incoming);
  const garrison = troopRows(village.troops, view.config, 'في القرية');
  const availableTotal = garrison.reduce((sum, row) => sum + row.count, 0);
  return {
    readiness: deriveRallyReadiness({
      hostile: attacks.length,
      training: Boolean(village.training),
      abroad: outgoing.length + outgoingScouts.length + returning.length,
    }),
    garrison,
    available: garrison.map((row) => ({ ...row, status: 'متاح للإرسال' })),
    availableTotal,
    outgoing: outgoing.map((movement) =>
      ownerRow(
        view,
        movement,
        placeName(view, movement.targetX, movement.targetY),
        'في الطريق',
        true,
      ),
    ),
    returning: returning.map((movement) =>
      ownerRow(
        view,
        movement,
        placeName(view, movement.targetX, movement.targetY),
        'عائد إلى القرية',
        true,
      ),
    ),
    attacks,
    incomingReinforcements: incoming.filter((threat) => threat.kind === 'friendly'),
    stationedReinforcements: Object.entries(village.reinforcements).map(([sourceId, troops]) => ({
      sourceId,
      name: view.map.find((item) => item.id === sourceId)?.kingdomName ?? 'مملكة',
      troops: troopRows(troops, view.config, 'متمركزة في القرية'),
    })),
    outgoingScouts: outgoingScouts.map((movement) =>
      ownerRow(
        view,
        movement,
        placeName(view, movement.targetX, movement.targetY),
        'استطلاع صادر',
        true,
      ),
    ),
    incomingScouts: incoming.filter((threat) => threat.kind === 'intelligence'),
    commanders: view.commanders ?? null,
    training: village.training,
    nearestThreat: attacks[0],
    activeCampaigns: outgoing.length + outgoingScouts.length,
    militaryReports: view.reports
      .filter((report) => report.combat || report.intel)
      .map((report) => ({ id: report.id, title: report.title, at: report.at })),
  };
}
