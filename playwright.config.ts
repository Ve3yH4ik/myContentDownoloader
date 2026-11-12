import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: 'tests/ui', workers: 1, timeout: 120000, expect:{timeout:20000}, reporter: 'list' });
