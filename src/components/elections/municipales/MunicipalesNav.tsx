"use client";

import { BarChart3, Home, Map, Scale, Users } from "lucide-react";
import { MunicipalesYearNav, type MunicipalesTab } from "./MunicipalesYearNav";

const TABS: MunicipalesTab[] = [
  { href: "/elections/municipales-2026", label: "Vue d'ensemble", icon: Home, exact: true },
  { href: "/elections/municipales-2026/maires", label: "Maires", icon: Users },
  { href: "/elections/municipales-2026/cumul", label: "Cumul", icon: Scale },
  { href: "/elections/municipales-2026/parite", label: "Parité", icon: BarChart3 },
  { href: "/elections/municipales-2026/carte", label: "Carte", icon: Map },
];

export function MunicipalesNav() {
  // No basePath: 2026 is the default election of the CommuneSearch component.
  return <MunicipalesYearNav tabs={TABS} search={{}} />;
}
