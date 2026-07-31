import type { Meta, StoryObj } from "@storybook/react";
import { Select } from "./select";

const meta: Meta<typeof Select> = {
  title: "UI/Select",
  component: Select,
  argTypes: {
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Select>;

export const Departements: Story = {
  render: (args) => (
    <Select aria-label="Filtrer par département" {...args}>
      <option value="">Tous les départements</option>
      <option value="75">Paris (75)</option>
      <option value="13">Bouches-du-Rhône (13)</option>
      <option value="69">Rhône (69)</option>
      <option value="33">Gironde (33)</option>
      <option value="59">Nord (59)</option>
      <option value="31">Haute-Garonne (31)</option>
      <option value="06">Alpes-Maritimes (06)</option>
      <option value="44">Loire-Atlantique (44)</option>
    </Select>
  ),
};

export const Partis: Story = {
  render: (args) => (
    <Select aria-label="Filtrer par parti" {...args}>
      <option value="">Tous les partis</option>
      <option value="RE">Renaissance</option>
      <option value="RN">Rassemblement National</option>
      <option value="LFI">La France Insoumise</option>
      <option value="LR">Les Républicains</option>
      <option value="PS">Parti Socialiste</option>
      <option value="EELV">Europe Écologie Les Verts</option>
      <option value="PCF">Parti Communiste Français</option>
    </Select>
  ),
};

export const MandateType: Story = {
  render: (args) => (
    <Select aria-label="Filtrer par type de mandat" {...args}>
      <option value="">Type de mandat</option>
      <option value="DEPUTE">Député</option>
      <option value="SENATEUR">Sénateur</option>
      <option value="MINISTER">Ministre</option>
      <option value="MAYOR">Maire</option>
      <option value="MEP">Député européen</option>
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select disabled aria-label="Sélection indisponible">
      <option>Sélection indisponible</option>
    </Select>
  ),
};
