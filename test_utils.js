/**
 * Test utilities for mocking fetch calls
 */

// Mock fetch implementation
const fetchMocks = new Map();

function mockFetch({ url, response, status = 200, delay = 0 }) {
  fetchMocks.set(url, { response, status, delay });
}

function resetMocks() {
  fetchMocks.clear();
}

// Global fetch mock
global.fetch = async function(url, options) {
  const mockData = fetchMocks.get(url);

  if (!mockData) {
    throw new Error(`No mock found for URL: ${url}`);
  }

  // Simulate network delay
  if (mockData.delay > 0) {
    await new Promise(resolve => setTimeout(resolve, mockData.delay));
  }

  // Return mock response
  return {
    ok: mockData.status >= 200 && mockData.status < 300,
    status: mockData.status,
    json: async () => mockData.response,
    text: async () => JSON.stringify(mockData.response)
  };
};

module.exports = {
  mockFetch,
  resetMocks
};