/**
 * API Controller
 * Contains all endpoint handlers for the API monitoring system
 */

const { StatusCodes } = require("http-status-codes");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const moment = require("moment");
const {
  Endpoint,
  Metric,
  Incident,
  Alert,
  User,
  SystemStatus,
} = require("../models");
const monitorService = require("../services/monitorService");
const securityMonitorService = require("../services/securityMonitorService");

// ==========================================
// Authentication Controllers
// ==========================================

/**
 * Register a new user
 * @route POST /api/auth/register
 */
const registerUser = async (req, res, next) => {
  try {
    const { username, email, password, role = "VIEWER" } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ username }, { email }],
      },
    });

    if (existingUser) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Username or email already in use",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role,
    });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || "api-monitor-secret-key",
      { expiresIn: "24h" }
    );

    // Return success response
    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "User registered successfully",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login user
 * @route POST /api/auth/login
 */
const loginUser = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Find user
    const user = await User.findOne({
      where: {
        [Op.or]: [{ username }, { email: username }],
      },
    });

    if (!user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Account is disabled. Please contact an administrator.",
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || "api-monitor-secret-key",
      { expiresIn: "24h" }
    );

    // Return success response
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Endpoint Controllers
// ==========================================

/**
 * Get all endpoints
 * @route GET /api/endpoints
 */
const getAllEndpoints = async (req, res, next) => {
  try {
    // Get query params
    const { active } = req.query;

    // Prepare query
    const query = {};
    if (active === "true") {
      query.isActive = true;
    } else if (active === "false") {
      query.isActive = false;
    }

    // Get endpoints
    const endpoints = await Endpoint.findAll({
      where: query,
      order: [["createdAt", "DESC"]],
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      count: endpoints.length,
      data: endpoints,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single endpoint
 * @route GET /api/endpoints/:id
 */
const getEndpoint = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get endpoint
    const endpoint = await Endpoint.findByPk(id);

    if (!endpoint) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Endpoint not found",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      data: endpoint,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create endpoint
 * @route POST /api/endpoints
 */
const createEndpoint = async (req, res, next) => {
  try {
    // Create endpoint
    const endpoint = await Endpoint.create(req.body);

    // Reload endpoints in monitor service
    await monitorService.loadEndpoints();

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Endpoint created successfully",
      data: endpoint,
    });
  } catch (error) {
    // Handle unique constraint error
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: "An endpoint with this path already exists",
      });
    }
    next(error);
  }
};

/**
 * Update endpoint
 * @route PUT /api/endpoints/:id
 */
const updateEndpoint = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get endpoint
    const endpoint = await Endpoint.findByPk(id);

    if (!endpoint) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Endpoint not found",
      });
    }

    // Update endpoint
    await endpoint.update(req.body);

    // Reload endpoints in monitor service
    await monitorService.loadEndpoints();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Endpoint updated successfully",
      data: endpoint,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete endpoint
 * @route DELETE /api/endpoints/:id
 */
const deleteEndpoint = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get endpoint
    const endpoint = await Endpoint.findByPk(id);

    if (!endpoint) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Endpoint not found",
      });
    }

    // Delete endpoint
    await endpoint.destroy();

    // Reload endpoints in monitor service
    await monitorService.loadEndpoints();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Endpoint deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Toggle endpoint active status
 * @route PATCH /api/endpoints/:id/toggle
 */
const toggleEndpoint = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get endpoint
    const endpoint = await Endpoint.findByPk(id);

    if (!endpoint) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Endpoint not found",
      });
    }

    // Toggle status
    endpoint.isActive = !endpoint.isActive;
    await endpoint.save();

    // Reload endpoints in monitor service
    await monitorService.loadEndpoints();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: `Endpoint ${
        endpoint.isActive ? "activated" : "deactivated"
      } successfully`,
      data: endpoint,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Metrics Controllers
// ==========================================

/**
 * Get metrics for endpoint
 * @route GET /api/metrics/:endpointId
 */
const getEndpointMetrics = async (req, res, next) => {
  try {
    const { endpointId } = req.params;
    const { timeRange = "24h" } = req.query;

    // Get detailed metrics from monitor service
    const metrics = await monitorService.getEndpointMetrics(
      endpointId,
      timeRange
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get metrics summary for all endpoints
 * @route GET /api/metrics/summary
 */
const getMetricsSummary = async (req, res, next) => {
  try {
    // Get time range from query
    const { timeRange = "24h" } = req.query;

    console.log(`Processing metrics summary for timeRange: ${timeRange}`);

    // Parse time range
    const timeParts = timeRange.match(/^(\d+)([hdwmy])$/);
    if (!timeParts) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid time range format. Use format like 1h, 24h, 7d, etc.",
      });
    }

    const value = parseInt(timeParts[1]);
    const unit = timeParts[2];

    let timeUnit;
    switch (unit) {
      case "h":
        timeUnit = "hours";
        break;
      case "d":
        timeUnit = "days";
        break;
      case "w":
        timeUnit = "weeks";
        break;
      case "m":
        timeUnit = "months";
        break;
      case "y":
        timeUnit = "years";
        break;
      default:
        timeUnit = "hours";
    }

    const startTime = moment().subtract(value, timeUnit).toDate();
    console.log(`Start time for metrics: ${startTime}`);

    // Get endpoints
    const endpoints = await Endpoint.findAll({
      where: { isActive: true },
    });

    console.log(`Found ${endpoints.length} active endpoints`);

    // Get metrics for each endpoint
    const endpointMetrics = [];
    for (const endpoint of endpoints) {
      try {
        console.log(
          `Processing metrics for endpoint ${endpoint.id}: ${endpoint.method} ${endpoint.path}`
        );

        // Get metrics for this endpoint
        const metrics = await Metric.findAll({
          where: {
            endpointId: endpoint.id,
            timestamp: { [Op.gte]: startTime },
          },
        });

        console.log(
          `Found ${metrics.length} metrics for endpoint ${endpoint.id}`
        );

        // Calculate statistics
        const totalRequests = metrics.length;
        const successfulRequests = metrics.filter((m) => m.success).length;
        const avgResponseTime = metrics.length
          ? metrics.reduce((sum, m) => sum + (m.responseTime || 0), 0) /
            metrics.length
          : 0;
        const successRate = totalRequests
          ? (successfulRequests / totalRequests) * 100
          : 100;

        // Generate time points
        const timePoints = [];
        const responseTimeSeries = [];
        const successRateSeries = [];

        // Get the last 24 hours in hourly intervals
        for (let i = 23; i >= 0; i--) {
          const hourTime = moment().subtract(i, "hours").format("HH:mm");
          timePoints.push(hourTime);

          // Calculate metrics for this hour
          const hourStart = moment()
            .subtract(i + 1, "hours")
            .toDate();
          const hourEnd = moment().subtract(i, "hours").toDate();

          const hourMetrics = metrics.filter(
            (m) =>
              new Date(m.timestamp) >= hourStart &&
              new Date(m.timestamp) < hourEnd
          );

          if (hourMetrics.length > 0) {
            const hourAvgResponseTime =
              hourMetrics.reduce((sum, m) => sum + (m.responseTime || 0), 0) /
              hourMetrics.length;
            const hourSuccessfulRequests = hourMetrics.filter(
              (m) => m.success
            ).length;
            const hourSuccessRate =
              (hourSuccessfulRequests / hourMetrics.length) * 100;

            responseTimeSeries.push(Math.round(hourAvgResponseTime));
            successRateSeries.push(parseFloat(hourSuccessRate.toFixed(2)));
          } else {
            // No data for this hour
            responseTimeSeries.push(null);
            successRateSeries.push(null);
          }
        }

        endpointMetrics.push({
          id: endpoint.id,
          path: endpoint.path,
          method: endpoint.method,
          metrics: {
            totalRequests,
            avgResponseTime: Math.round(avgResponseTime),
            successRate: parseFloat(successRate.toFixed(2)),
            status:
              successRate >= endpoint.availabilityThreshold
                ? "healthy"
                : "degraded",
            timePoints,
            responseTimeSeries,
            successRateSeries,
          },
        });
      } catch (endpointError) {
        console.error(
          `Error processing endpoint ${endpoint.id}:`,
          endpointError
        );
        // Continue with next endpoint instead of failing the whole request
      }
    }

    // Calculate overall statistics
    let totalRequests = 0;
    let totalSuccessRequests = 0;
    let totalResponseTime = 0;

    endpointMetrics.forEach((endpoint) => {
      totalRequests += endpoint.metrics.totalRequests;
      totalSuccessRequests += Math.round(
        (endpoint.metrics.totalRequests * endpoint.metrics.successRate) / 100
      );
      totalResponseTime +=
        endpoint.metrics.avgResponseTime * endpoint.metrics.totalRequests;
    });

    const overallSuccessRate =
      totalRequests > 0 ? (totalSuccessRequests / totalRequests) * 100 : 100;
    const overallAvgResponseTime =
      totalRequests > 0 ? totalResponseTime / totalRequests : 0;

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        timeRange,
        overall: {
          totalRequests,
          successRate: parseFloat(overallSuccessRate.toFixed(2)),
          avgResponseTime: Math.round(overallAvgResponseTime),
          status:
            overallSuccessRate >= 99
              ? "healthy"
              : overallSuccessRate >= 95
              ? "degraded"
              : "critical",
        },
        endpoints: endpointMetrics,
      },
    });
  } catch (error) {
    console.error("Error in getMetricsSummary:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch metrics summary",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ==========================================
// Incident Controllers
// ==========================================

/**
 * Get all incidents
 * @route GET /api/incidents
 */
const getAllIncidents = async (req, res, next) => {
  try {
    // Get query params
    const { status, endpointId, limit = 20, offset = 0 } = req.query;

    // Prepare query
    const query = {};
    if (status) {
      query.status = status.toUpperCase();
    }
    if (endpointId) {
      query.endpointId = endpointId;
    }

    // Get incidents
    const incidents = await Incident.findAndCountAll({
      where: query,
      include: [
        {
          model: Endpoint,
          attributes: ["path", "method"],
        },
      ],
      order: [["startTime", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      count: incidents.count,
      data: incidents.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single incident
 * @route GET /api/incidents/:id
 */
const getIncident = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get incident
    const incident = await Incident.findByPk(id, {
      include: [
        {
          model: Endpoint,
          attributes: ["path", "method"],
        },
        {
          model: Alert,
          attributes: ["id", "type", "message", "timestamp", "status"],
        },
      ],
    });

    if (!incident) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Incident not found",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      data: incident,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update incident status
 * @route PATCH /api/incidents/:id/status
 */
const updateIncidentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, resolution, resolvedBy } = req.body;

    // Validate status
    if (!["OPEN", "ACKNOWLEDGED", "RESOLVED"].includes(status.toUpperCase())) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid status. Must be one of: OPEN, ACKNOWLEDGED, RESOLVED",
      });
    }

    // Get incident
    const incident = await Incident.findByPk(id);

    if (!incident) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Incident not found",
      });
    }

    // Update incident
    incident.status = status.toUpperCase();

    // If resolving, add resolution details and end time
    if (status.toUpperCase() === "RESOLVED") {
      incident.resolution = resolution || "Resolved without details";
      incident.resolvedBy = resolvedBy || req.user?.username || "System";
      incident.endTime = new Date();
    }

    await incident.save();

    // If resolved, update any related alerts
    if (status.toUpperCase() === "RESOLVED") {
      await Alert.update({ status: "RESOLVED" }, { where: { incidentId: id } });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: `Incident status updated to ${status}`,
      data: incident,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Alert Controllers
// ==========================================

/**
 * Get all alerts
 * @route GET /api/alerts
 */
const getAllAlerts = async (req, res, next) => {
  try {
    // Get query params
    const { status, endpointId, limit = 20, offset = 0 } = req.query;

    // Prepare query
    const query = {};
    if (status) {
      query.status = status.toUpperCase();
    }
    if (endpointId) {
      query.endpointId = endpointId;
    }

    // Get alerts
    const alerts = await Alert.findAndCountAll({
      where: query,
      include: [
        {
          model: Endpoint,
          attributes: ["path", "method"],
        },
      ],
      order: [["timestamp", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      count: alerts.count,
      data: alerts.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update alert status
 * @route PATCH /api/alerts/:id/status
 */
const updateAlertStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    if (!["NEW", "ACKNOWLEDGED", "RESOLVED"].includes(status.toUpperCase())) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid status. Must be one of: NEW, ACKNOWLEDGED, RESOLVED",
      });
    }

    // Get alert
    const alert = await Alert.findByPk(id);

    if (!alert) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Alert not found",
      });
    }

    // Update alert
    alert.status = status.toUpperCase();

    // If acknowledging, set acknowledged details
    if (status.toUpperCase() === "ACKNOWLEDGED") {
      alert.acknowledgedAt = new Date();
      alert.acknowledgedBy = req.user?.username || "System";
    }

    await alert.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: `Alert status updated to ${status}`,
      data: alert,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Dashboard Controllers
// ==========================================

/**
 * Get monitoring overview
 * @route GET /api/dashboard/overview
 */
const getMonitoringOverview = async (req, res, next) => {
  try {
    // Get monitoring overview from service
    const overview = await monitorService.getMonitoringOverview();

    return res.status(StatusCodes.OK).json({
      success: true,
      data: overview,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get system status
 * @route GET /api/dashboard/system-status
 */
const getSystemStatus = async (req, res, next) => {
  try {
    // Get latest system status
    const systemStatus = await SystemStatus.findOne({
      order: [["timestamp", "DESC"]],
    });

    // Get system status history (last 24 hours)
    const oneDayAgo = moment().subtract(1, "day").toDate();
    const statusHistory = await SystemStatus.findAll({
      where: {
        timestamp: { [Op.gte]: oneDayAgo },
      },
      order: [["timestamp", "ASC"]],
    });

    // Process history into time series
    const timePoints = [];
    const cpuSeries = [];
    const memorySeries = [];
    const diskSeries = [];
    const networkSeries = [];

    statusHistory.forEach((status) => {
      timePoints.push(moment(status.timestamp).format("HH:mm"));
      cpuSeries.push(status.cpuUsage);
      memorySeries.push(status.memoryUsage);
      diskSeries.push(status.diskUsage);
      networkSeries.push(status.networkUsage);
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        current: systemStatus,
        history: {
          timePoints,
          cpuSeries,
          memorySeries,
          diskSeries,
          networkSeries,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Monitoring Service Control
// ==========================================

/**
 * Start monitoring service
 * @route POST /api/monitor/start
 */
const startMonitoring = async (req, res, next) => {
  try {
    const success = await monitorService.start();

    if (!success) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Failed to start monitoring service",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Monitoring service started successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Stop monitoring service
 * @route POST /api/monitor/stop
 */
const stopMonitoring = async (req, res, next) => {
  try {
    const success = monitorService.stop();

    if (!success) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Failed to stop monitoring service",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Monitoring service stopped successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get monitoring status
 * @route GET /api/monitor/status
 */
const getMonitoringStatus = async (req, res, next) => {
  try {
    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        isRunning: monitorService.isRunning,
        monitoringInterval: monitorService.monitoringIntervalMs,
        activeEndpointsCount: monitorService.endpoints.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// User Management Controllers
// ==========================================

/**
 * Get all users
 * @route GET /api/users
 */
const getAllUsers = async (req, res, next) => {
  try {
    // Only admins can see all users
    if (req.user.role !== "ADMIN") {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: "Insufficient permissions to access this resource",
      });
    }

    // Get users (exclude password)
    const users = await User.findAll({
      attributes: { exclude: ["password"] },
      order: [["createdAt", "DESC"]],
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user
 * @route PUT /api/users/:id
 */
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Only admins can update other users
    if (req.user.role !== "ADMIN" && parseInt(id) !== req.user.id) {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: "Insufficient permissions to update this user",
      });
    }

    // Get user
    const user = await User.findByPk(id);

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "User not found",
      });
    }

    // Update user (prevent role and isActive changes unless admin)
    const updatedFields = { ...req.body };

    if (req.user.role !== "ADMIN") {
      delete updatedFields.role;
      delete updatedFields.isActive;
    }

    // Hash password if provided
    if (updatedFields.password) {
      const salt = await bcrypt.genSalt(10);
      updatedFields.password = await bcrypt.hash(updatedFields.password, salt);
    }

    // Update user
    await user.update(updatedFields);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "User updated successfully",
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get health score for an endpoint
 * @route GET /api/metrics/:endpointId/health
 */
const getEndpointHealthScore = async (req, res, next) => {
  try {
    const { endpointId } = req.params;

    // Calculate health score
    const healthScore = await monitorService.calculateEndpointHealthScore(
      endpointId
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      data: healthScore,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get security alerts
 * @route GET /api/security/alerts
 */

const getSecurityAlerts = async (req, res, next) => {
  try {
    // Get query params
    const { status, type, endpointId, limit = 20, offset = 0 } = req.query;

    // Prepare query
    const query = {};
    if (status) {
      query.status = status.toUpperCase();
    }
    if (type) {
      query.type = type.toUpperCase();
    }
    if (endpointId) {
      query.endpointId = endpointId;
    }

    try {
      // Get alerts with proper includes
      const alerts = await SecurityAlert.findAndCountAll({
        where: query,
        include: [
          {
            model: Endpoint,
            attributes: ["path", "method"],
          },
        ],
        order: [["timestamp", "DESC"]],
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      // Convert Sequelize instances to plain objects
      const plainAlerts = alerts.rows.map((alert) => {
        const plainAlert = alert.get({ plain: true });
        // Ensure any nested relations are properly formatted
        return plainAlert;
      });

      return res.status(StatusCodes.OK).json({
        success: true,
        count: alerts.count,
        data: plainAlerts,
      });
    } catch (dbError) {
      console.error("Database error in security alerts:", dbError);

      // Return empty data with success status
      return res.status(StatusCodes.OK).json({
        success: true,
        count: 0,
        data: [],
        message: "Error retrieving alerts",
      });
    }
  } catch (error) {
    next(error);
  }
};
/**
 * Get security overview
 * @route GET /api/security/overview
 */
const getSecurityOverview = async (req, res, next) => {
  try {
    const overview = await securityMonitorService.getSecurityOverview();

    return res.status(StatusCodes.OK).json({
      success: true,
      data: overview,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update security alert status
 * @route PATCH /api/security/alerts/:id/status
 */
const updateSecurityAlertStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    if (
      !["NEW", "ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"].includes(status)
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message:
          "Invalid status. Must be one of: NEW, ACKNOWLEDGED, RESOLVED, FALSE_POSITIVE",
      });
    }

    const alert = await securityMonitorService.updateAlertStatus(
      id,
      status,
      req.user?.username || "System"
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      message: `Security alert status updated to ${status}`,
      data: alert,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Start security monitoring
 * @route POST /api/security/start
 */
const startSecurityMonitoring = async (req, res, next) => {
  try {
    const success = await securityMonitorService.start();

    if (!success) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Failed to start security monitoring service",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Security monitoring service started",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Stop security monitoring
 * @route POST /api/security/stop
 */
const stopSecurityMonitoring = async (req, res, next) => {
  try {
    const success = securityMonitorService.stop();

    if (!success) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Failed to stop security monitoring service",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Security monitoring service stopped",
    });
  } catch (error) {
    next(error);
  }
};
// ==========================================
// Export Controllers
// ==========================================
module.exports = {
  // Authentication
  registerUser,
  loginUser,

  // Endpoints
  getAllEndpoints,
  getEndpoint,
  createEndpoint,
  updateEndpoint,
  deleteEndpoint,
  toggleEndpoint,

  // Metrics
  getEndpointMetrics,
  getMetricsSummary,

  // Incidents
  getAllIncidents,
  getIncident,
  updateIncidentStatus,

  // Alerts
  getAllAlerts,
  updateAlertStatus,

  // Dashboard
  getMonitoringOverview,
  getSystemStatus,

  // Monitoring Service
  startMonitoring,
  stopMonitoring,
  getMonitoringStatus,

  // User Management
  getAllUsers,
  updateUser,

  // health score
  getEndpointHealthScore,

  // Security Monitor

  getSecurityAlerts,
  getSecurityOverview,
  updateSecurityAlertStatus,
  startSecurityMonitoring,
  stopSecurityMonitoring,
};
