import type { Meta, StoryObj } from "@storybook/react";
import { Briefcase, Building2, Globe, Landmark, MapPin } from "lucide-react";
import { RubriqueEntrees, type RubriqueEntree } from "./RubriqueEntrees";

const ENTREES: RubriqueEntree[] = [
  {
    href: "/politiques?mandate=depute",
    title: "Députés",
    icon: Landmark,
    detail: "577 en exercice",
  },
  {
    href: "/politiques?mandate=senateur",
    title: "Sénateurs",
    icon: Building2,
    detail: "348 en exercice",
  },
  {
    href: "/politiques?mandate=depute_europeen",
    title: "Eurodéputés",
    icon: Globe,
    detail: "Parlement européen",
  },
  {
    href: "/politiques?mandate=maire",
    title: "Maires",
    icon: MapPin,
    detail: "34 000 en exercice",
  },
  {
    href: "/politiques/gouvernements",
    title: "Gouvernement",
    icon: Briefcase,
    detail: "Ministres et compositions successives",
  },
];

const meta: Meta<typeof RubriqueEntrees> = {
  title: "UI/RubriqueEntrees",
  component: RubriqueEntrees,
  args: { titre: "Explorer par mandat", titreId: "explorer-par-mandat" },
};

export default meta;
type Story = StoryObj<typeof RubriqueEntrees>;

export const CinqEntrees: Story = { args: { entrees: ENTREES } };

export const QuatreEntrees: Story = { args: { entrees: ENTREES.slice(0, 4) } };
