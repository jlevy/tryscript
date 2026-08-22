/**
 * Environment variable expansion utilities.
 *
 * Provides shell-compatible variable expansion for configuration values.
 */

/**
 * Matches `$$` (an escaped literal `$`), `${VAR}`, or `$VAR`, in that order so an escape
 * is consumed before it can be read as the start of a reference. One combined pattern
 * keeps expansion single-pass: separate passes would rescan substituted values, so a
 * variable holding `$HOME` would expand a second time.
 */
const ENV_VAR_PATTERN = /\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Expand environment variable references in a string.
 *
 * Supports standard shell variable syntax:
 * - `$VAR` - simple variable reference
 * - `${VAR}` - braced variable reference
 * - `$$` - a literal `$`
 *
 * Variables are resolved in order:
 * 1. Custom env vars (if provided)
 * 2. Process environment variables
 * 3. Empty string (if undefined)
 *
 * Substituted values are never rescanned, so a variable whose value contains `$VAR`
 * expands once and keeps that text.
 *
 * @param str - String containing variable references
 * @param customEnv - Optional custom environment to check first
 * @returns String with variables expanded
 *
 * @example
 * ```ts
 * expandEnvVars('$HOME/bin')           // '/home/user/bin'
 * expandEnvVars('${HOME}/bin')         // '/home/user/bin'
 * expandEnvVars('$UNDEFINED')          // ''
 * expandEnvVars('costs $$5')           // 'costs $5'
 * expandEnvVars('$MY_VAR', { MY_VAR: 'value' }) // 'value'
 * ```
 */
export function expandEnvVars(str: string, customEnv?: Record<string, string>): string {
  const resolve = (varName: string): string => {
    return customEnv?.[varName] ?? process.env[varName] ?? '';
  };

  return str.replace(
    ENV_VAR_PATTERN,
    (match: string, bracedName: string | undefined, bareName: string | undefined) =>
      match === '$$' ? '$' : resolve(bracedName ?? bareName ?? ''),
  );
}

/**
 * Create a bound expander with a preset custom environment.
 *
 * Useful when expanding multiple strings with the same custom env.
 *
 * @param customEnv - Custom environment variables to use
 * @returns Bound expand function
 *
 * @example
 * ```ts
 * const expand = createEnvExpander({ TRYSCRIPT_ROOT: '/project' });
 * expand('$TRYSCRIPT_ROOT/dist')  // '/project/dist'
 * expand('$HOME/bin')             // Uses process.env.HOME
 * ```
 */
export function createEnvExpander(customEnv: Record<string, string>): (str: string) => string {
  return (str: string) => expandEnvVars(str, customEnv);
}
