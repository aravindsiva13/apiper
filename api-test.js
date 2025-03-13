/**
 * API Testing Script for API Performance Monitor
 *
 * This script tests the main API endpoints to verify functionality
 */

const axios = require("axios");

// Configuration
const API_URL = "http://localhost:3001/api";
let authToken = null;

// Helper function for making authenticated requests
const apiRequest = async (method, endpoint, data = null) => {
  const headers = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  try {
    const response = await axios({
      method,
      url: `${API_URL}${endpoint}`,
      data,
      headers,
    });
    return response.data;
  } catch (error) {
    console.error(
      `Error ${method} ${endpoint}:`,
      error.response?.data || error.message
    );
    throw error;
  }
};

// Test functions
const tests = {
  // Test root endpoint
  async testRoot() {
    console.log("\n🔍 Testing root endpoint...");
    try {
      const response = await axios.get(API_URL.replace("/api", ""));
      console.log("✅ Root endpoint:", response.data);
      return true;
    } catch (error) {
      console.error("❌ Root endpoint error:", error.message);
      return false;
    }
  },

  // Test authentication
  async testAuth() {
    console.log("\n🔍 Testing authentication...");
    try {
      const loginData = {
        username: "admin",
        password: "admin123",
      };

      const response = await axios.post(`${API_URL}/auth/login`, loginData);
      authToken = response.data.token;
      console.log("✅ Login successful, token received");
      return true;
    } catch (error) {
      console.error(
        "❌ Authentication error:",
        error.response?.data || error.message
      );
      return false;
    }
  },

  // Test endpoints listing
  async testGetEndpoints() {
    console.log("\n🔍 Testing endpoints listing...");
    try {
      const endpoints = await apiRequest("get", "/endpoints");
      console.log(`✅ Found ${endpoints.count} endpoints:`);
      endpoints.data.forEach((endpoint) => {
        console.log(
          `   - ${endpoint.method} ${endpoint.baseUrl}${endpoint.path}`
        );
      });
      return true;
    } catch (error) {
      return false;
    }
  },

  // Test creating an endpoint
  async testCreateEndpoint() {
    console.log("\n🔍 Testing endpoint creation...");
    try {
      const newEndpoint = {
        path: "/photos",
        method: "GET",
        description: "Test endpoint for photos",
        baseUrl: "https://jsonplaceholder.typicode.com",
        responseTimeThreshold: 500,
        errorRateThreshold: 1.0,
        availabilityThreshold: 99.5,
        isActive: true,
      };

      const response = await apiRequest("post", "/endpoints", newEndpoint);
      console.log("✅ Endpoint created:", response.message);
      return true;
    } catch (error) {
      console.log(
        "ℹ️ Note: This may fail if the endpoint already exists, which is expected"
      );
      return false;
    }
  },

  // Test dashboard overview
  async testDashboardOverview() {
    console.log("\n🔍 Testing dashboard overview...");
    try {
      const overview = await apiRequest("get", "/dashboard/overview");
      console.log(
        "✅ Dashboard overview:",
        JSON.stringify(overview.data, null, 2)
      );
      return true;
    } catch (error) {
      return false;
    }
  },

  // Test system status
  async testSystemStatus() {
    console.log("\n🔍 Testing system status...");
    try {
      const status = await apiRequest("get", "/dashboard/system-status");
      console.log("✅ System status received");
      return true;
    } catch (error) {
      return false;
    }
  },

  // Test incidents listing
  async testIncidents() {
    console.log("\n🔍 Testing incidents listing...");
    try {
      const incidents = await apiRequest("get", "/incidents");
      console.log(`✅ Found ${incidents.count} incidents`);
      return true;
    } catch (error) {
      return false;
    }
  },
};

// Run all tests
async function runTests() {
  console.log("🚀 Starting API tests...");

  // First test the root endpoint
  const rootResult = await tests.testRoot();
  if (!rootResult) {
    console.error("❌ Root test failed, API server might not be running");
    return;
  }

  // Test authentication
  const authResult = await tests.testAuth();
  if (!authResult) {
    console.error(
      "❌ Authentication failed, cannot proceed with authenticated tests"
    );
    return;
  }

  // Run the rest of the tests
  await tests.testGetEndpoints();
  await tests.testCreateEndpoint();
  await tests.testDashboardOverview();
  await tests.testSystemStatus();
  await tests.testIncidents();

  console.log("\n🏁 API testing completed!");
}

// Run the tests
runTests().catch((error) => {
  console.error("❌ Test execution error:", error);
});
