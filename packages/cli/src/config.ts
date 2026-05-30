/**
 * Orbit configuration types and helpers.
 */

export interface OrbitConfig {
  entry: string;
  build?: {
    outDir?: string;
    minify?: boolean;
  };
  actors?: Record<string, { className: string }>;
}

export function defineConfig(config: OrbitConfig): OrbitConfig {
  return config;
}
