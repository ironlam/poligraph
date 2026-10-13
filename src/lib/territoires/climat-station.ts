import { CLIMAT_STATION_MAX_KM } from "@/config/territoire-reperes";

/**
 * Reference weather station of a commune (#1052, "Le territoire en chiffres", lot R3). Pure: no
 * data access, no source. The climate source itself is not imported yet (its licence is not
 * confirmed, see src/config/territoires-sources.ts); this is the rule its import will apply.
 *
 * One station, never an average: the nearest station of the SAME department, strictly closer than
 * the threshold. Otherwise the figure is not established, and that is said, not filled in.
 */

export interface ClimatStation {
  id: string;
  name: string;
  departmentCode: string;
  lat: number;
  lon: number;
  /** Annual mean temperature of the 1991-2020 normals, null when the station has none. */
  tempMoyenne: number | null;
  /** Annual precipitation of the 1991-2020 normals, in mm, null when the station has none. */
  precipitations: number | null;
}

export interface ClimatCommune {
  departmentCode: string;
  lat: number;
  lon: number;
}

export type ClimatReference =
  | { state: "ETABLI"; station: ClimatStation; km: number }
  | {
      state: "NON_ETABLI";
      reason: "AUCUNE_STATION_DANS_LE_DEPARTEMENT" | "STATION_TROP_ELOIGNEE";
    };

const EARTH_RADIUS_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function pickReferenceStation(
  commune: ClimatCommune,
  stations: readonly ClimatStation[],
  maxKm: number = CLIMAT_STATION_MAX_KM
): ClimatReference {
  const sameDepartment = stations.filter((s) => s.departmentCode === commune.departmentCode);
  if (sameDepartment.length === 0) {
    return { state: "NON_ETABLI", reason: "AUCUNE_STATION_DANS_LE_DEPARTEMENT" };
  }
  let best: { station: ClimatStation; km: number } | null = null;
  for (const station of sameDepartment) {
    const km = distanceKm(commune, station);
    // Ties go to the station with the smaller id, so the pick never depends on input order.
    if (!best || km < best.km || (km === best.km && station.id < best.station.id)) {
      best = { station, km };
    }
  }
  if (!best || best.km >= maxKm) return { state: "NON_ETABLI", reason: "STATION_TROP_ELOIGNEE" };
  return { state: "ETABLI", station: best.station, km: best.km };
}

export const CLIMAT_PERIOD = { start: "1991-01-01", end: "2020-12-31" } as const;

export interface ClimatRowInput {
  territoryCode: string;
  indicatorKey: "climat_temp_moyenne" | "climat_precipitations";
  periodStart: string;
  periodEnd: string;
  scopeKind: "STATION";
  scopeId: string;
  /** "Station X, à 14 km": the station and its distance travel with the figure. */
  scopeLabel: string | null;
  value: number | null;
  unit: string;
  state: "ETABLI" | "NON_ETABLI";
  reason:
    | "AUCUNE_STATION_DANS_LE_DEPARTEMENT"
    | "STATION_TROP_ELOIGNEE"
    | "VALEUR_ABSENTE_STATION"
    | null;
}

/** The two climate rows of a commune, from its reference. Never a zero, never an average. */
export function climatRows(territoryCode: string, ref: ClimatReference): ClimatRowInput[] {
  const base = {
    territoryCode,
    periodStart: CLIMAT_PERIOD.start,
    periodEnd: CLIMAT_PERIOD.end,
    scopeKind: "STATION" as const,
  };
  const defs = [
    {
      indicatorKey: "climat_temp_moyenne" as const,
      unit: "°C",
      pick: (s: ClimatStation) => s.tempMoyenne,
    },
    {
      indicatorKey: "climat_precipitations" as const,
      unit: "mm",
      pick: (s: ClimatStation) => s.precipitations,
    },
  ];
  return defs.map((d) => {
    if (ref.state === "NON_ETABLI") {
      return {
        ...base,
        indicatorKey: d.indicatorKey,
        scopeId: "",
        scopeLabel: null,
        value: null,
        unit: d.unit,
        state: "NON_ETABLI",
        reason: ref.reason,
      };
    }
    const value = d.pick(ref.station);
    return {
      ...base,
      indicatorKey: d.indicatorKey,
      scopeId: ref.station.id,
      scopeLabel: `${ref.station.name}, à ${Math.round(ref.km)} km`,
      value,
      unit: d.unit,
      state: value === null ? "NON_ETABLI" : "ETABLI",
      reason: value === null ? "VALEUR_ABSENTE_STATION" : null,
    };
  });
}
