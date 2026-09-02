"use client";

import { Home, MapPin } from "lucide-react";
import { MunicipalesYearNav, type MunicipalesTab } from "./MunicipalesYearNav";

const BASE_PATH = "/elections/municipales-2020";

const TABS: MunicipalesTab[] = [
  { href: BASE_PATH, label: "Résultats", icon: Home, exact: true },
  { href: `${BASE_PATH}/departements`, label: "Départements", icon: MapPin },
];

export function Municipales2020Nav() {
  return (
    <MunicipalesYearNav
      tabs={TABS}
      search={{ basePath: BASE_PATH, label: "Résultats dans ma commune" }}
    />
  );
}
