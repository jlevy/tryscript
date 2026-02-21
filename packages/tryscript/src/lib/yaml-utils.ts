import { stringify } from 'yaml';

/**
 * Manual key order comparator for YAML `sortMapEntries`.
 *
 * Keys listed in `order` appear first (in that order); unlisted keys sort
 * to the end alphabetically. Adapted from tbd sorting patterns
 * (`ordering.manual`).
 */
export function manualKeyOrder(order: readonly string[]) {
  const orderMap = new Map(order.map((key, index) => [key, index]));
  return (a: { key: { value: string } }, b: { key: { value: string } }): number => {
    const indexA = orderMap.get(a.key.value);
    const indexB = orderMap.get(b.key.value);
    if (indexA === undefined && indexB === undefined) {
      return a.key.value.localeCompare(b.key.value);
    }
    if (indexA === undefined) {
      return 1;
    }
    if (indexB === undefined) {
      return -1;
    }
    return indexA - indexB;
  };
}

const DEFAULT_YAML_LINE_WIDTH = 88;

export const YAML_STRINGIFY_OPTIONS = {
  lineWidth: DEFAULT_YAML_LINE_WIDTH,
  defaultStringType: 'PLAIN' as const,
  defaultKeyType: 'PLAIN' as const,
};

export function stringifyYaml(data: unknown, options?: object): string {
  return stringify(data, { ...YAML_STRINGIFY_OPTIONS, ...options });
}
