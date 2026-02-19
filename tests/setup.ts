import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Setup fake IndexedDB для тестів
import 'fake-indexeddb/auto';

// Очищення після кожного тесту
afterEach(() => {
  cleanup();
});
