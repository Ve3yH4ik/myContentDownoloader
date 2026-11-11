import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: 'tests/ui', workers: 1, timeout: 60000, reporter: 'list' });
