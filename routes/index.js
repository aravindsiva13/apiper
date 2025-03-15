/**
 * Routes index
 * All API routes defined in one file
 */

const express = require("express");
const router = express.Router();
const apiController = require("../controllers/apiController");
const { authenticate } = require("../middleware");

// Create a simple authorize middleware function
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    // Check if user role is in allowed roles
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions to access this resource",
      });
    }

    next();
  };
};

// ==========================================
// Auth Routes
// ==========================================
router.post("/auth/register", apiController.registerUser);
router.post("/auth/login", apiController.loginUser);

// ==========================================
// Endpoint Routes
// ==========================================
router.get("/endpoints", authenticate, apiController.getAllEndpoints);
router.get("/endpoints/:id", authenticate, apiController.getEndpoint);
router.post(
  "/endpoints",
  authenticate,
  authorize(["ADMIN", "USER"]),
  apiController.createEndpoint
);
router.put(
  "/endpoints/:id",
  authenticate,
  authorize(["ADMIN", "USER"]),
  apiController.updateEndpoint
);
router.delete(
  "/endpoints/:id",
  authenticate,
  authorize(["ADMIN"]),
  apiController.deleteEndpoint
);
router.patch(
  "/endpoints/:id/toggle",
  authenticate,
  authorize(["ADMIN", "USER"]),
  apiController.toggleEndpoint
);

// ==========================================
// Metrics Routes
// ==========================================

router.get("/metrics/summary", authenticate, apiController.getMetricsSummary);

router.get(
  "/metrics/:endpointId",
  authenticate,
  apiController.getEndpointMetrics
);

// ==========================================
// Incident Routes
// ==========================================
router.get("/incidents", authenticate, apiController.getAllIncidents);
router.get("/incidents/:id", authenticate, apiController.getIncident);
router.patch(
  "/incidents/:id/status",
  authenticate,
  authorize(["ADMIN", "USER"]),
  apiController.updateIncidentStatus
);

// ==========================================
// Alert Routes
// ==========================================
router.get("/alerts", authenticate, apiController.getAllAlerts);
router.patch(
  "/alerts/:id/status",
  authenticate,
  authorize(["ADMIN", "USER"]),
  apiController.updateAlertStatus
);

// ==========================================
// Dashboard Routes
// ==========================================
router.get(
  "/dashboard/overview",
  authenticate,
  apiController.getMonitoringOverview
);
router.get(
  "/dashboard/system-status",
  authenticate,
  apiController.getSystemStatus
);

// ==========================================
// Monitoring Service Routes
// ==========================================
router.post(
  "/monitor/start",
  authenticate,
  authorize(["ADMIN"]),
  apiController.startMonitoring
);
router.post(
  "/monitor/stop",
  authenticate,
  authorize(["ADMIN"]),
  apiController.stopMonitoring
);
router.get("/monitor/status", authenticate, apiController.getMonitoringStatus);

// ==========================================
// User Management Routes
// ==========================================
router.get(
  "/users",
  authenticate,
  authorize(["ADMIN"]),
  apiController.getAllUsers
);
router.put("/users/:id", authenticate, apiController.updateUser);
// ==========================================
// health score  Routes
// ==========================================

router.get(
  "/metrics/:endpointId/health",
  authenticate,
  apiController.getEndpointHealthScore
);

// ==========================================
// Security  Routes
// ==========================================

router.get("/security/alerts", authenticate, apiController.getSecurityAlerts);
router.get(
  "/security/overview",
  authenticate,
  apiController.getSecurityOverview
);
router.patch(
  "/security/alerts/:id/status",
  authenticate,
  authorize(["ADMIN", "USER"]),
  apiController.updateSecurityAlertStatus
);
router.post(
  "/security/start",
  authenticate,
  authorize(["ADMIN"]),
  apiController.startSecurityMonitoring
);
router.post(
  "/security/stop",
  authenticate,
  authorize(["ADMIN"]),
  apiController.stopSecurityMonitoring
);
module.exports = router;
