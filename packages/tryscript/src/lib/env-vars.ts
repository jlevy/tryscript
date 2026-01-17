/**
 * Environment variable expansion utilities.
 *
 * Provides shell-compatible variable expansion for configuration values.
 */

/**
 * Expand environment variable references in a string.
 *
 * Supports standard shell variable syntax:
 * - `$VAR` - simple variable reference
 * - `${VAR}` - braced variable reference
 *
 * Variables are resolved in order:
 * 1. Custom env vars (if provided)
 * 2. Process environment variables
 * 3. Empty string (if undefined)
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
 * expandEnvVars('$MY_VAR', { MY_VAR: 'value' }) // 'value'
 * ```
 */
export function expandEnvVars(str: string, customEnv?: Record<string, string>): string {
  const resolve = (varName: string): string => {
    return customEnv?.[varName] ?? process.env[varName] ?? '';
  };

  return str
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, varName: string) => resolve(varName))
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, varName: string) => resolve(varName));
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
