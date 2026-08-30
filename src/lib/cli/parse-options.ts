export type CLIOptionDefinition = {
  name: `--${string}`;
  alias?: `-${string}`;
  type: "boolean" | "number" | "string";
};

export type ParsedCLIOptions = Record<string, boolean | number | string>;

function optionKey(name: string): string {
  return name.replace(/^--/, "").replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function parseBoolean(value: string, optionName: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${optionName} attend true ou false`);
}

function parseValue(value: string, definition: CLIOptionDefinition): boolean | number | string {
  if (definition.type === "string") return value;
  if (definition.type === "boolean") return parseBoolean(value, definition.name);

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${definition.name} attend un nombre`);
  return parsed;
}

/**
 * Parse les deux conventions CLI employées dans les scripts : `--option valeur` et
 * `--option=valeur`. Les options inconnues, dupliquées ou privées de valeur sont refusées afin
 * qu'une commande d'opération ne puisse pas s'exécuter avec des paramètres ignorés.
 */
export function parseCLIOptions(
  args: string[],
  definitions: readonly CLIOptionDefinition[]
): ParsedCLIOptions {
  const parsed: ParsedCLIOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;
    const separator = token.indexOf("=");
    const optionName = separator === -1 ? token : token.slice(0, separator);
    const inlineValue = separator === -1 ? undefined : token.slice(separator + 1);
    const definition = definitions.find(
      (candidate) => candidate.name === optionName || candidate.alias === optionName
    );
    if (!definition) throw new Error(`Option inconnue : ${optionName}`);

    const key = optionKey(definition.name);
    if (Object.hasOwn(parsed, key)) throw new Error(`Option dupliquée : ${definition.name}`);

    if (definition.type === "boolean" && inlineValue === undefined) {
      parsed[key] = true;
      continue;
    }

    const value = inlineValue ?? args[index + 1];
    if (value === undefined || (inlineValue === undefined && value.startsWith("-"))) {
      throw new Error(`Valeur manquante pour ${definition.name}`);
    }
    if (inlineValue === undefined) index += 1;
    parsed[key] = parseValue(value, definition);
  }

  return parsed;
}
