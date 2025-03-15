/**
 * Monitor Service
 * Handles all API monitoring, metric collection, and alert generation
 */

const axios = require("axios");
const { Op } = require("sequelize");
const moment = require("moment");
const {
  Endpoint,
  Metric,
  Incident,
  Alert,
  SystemStatus,
} = require("../models");
const os = require("os");

class MonitorService {
  constructor() {
    this.isRunning = false;
    this.monitoringInterval = null;
    this.monitoringIntervalMs = process.env.MONITORING_INTERVAL || 60000; // 1 minute default
    this.endpoints = [];
    this.httpClient = axios.create({
      timeout: 30000, // 30 second timeout
    });
  }

  /**
   * Start the monitoring service
   * @returns {Promise<boolean>} Success status
   */
  async start() {
    if (this.isRunning) {
      console.log("Monitoring service is already running");
      return false;
    }

    try {
      // Load active endpoints from database
      await this.loadEndpoints();

      // Start monitoring if there are endpoints
      if (this.endpoints.length === 0) {
        console.log("No active endpoints to monitor");
        return false;
      }

      this.isRunning = true;

      // Initial metrics collection
      await this.collectAllMetrics();

      // Create interval for continuous monitoring
      this.monitoringInterval = setInterval(async () => {
        try {
          await this.collectAllMetrics();

          // Every 5 minutes, collect system status
          if (Date.now() % (5 * 60 * 1000) < this.monitoringIntervalMs) {
            await this.collectSystemStatus();
          }

          // Clean up old metrics periodically (once per day)
          if (Date.now() % (24 * 60 * 60 * 1000) < this.monitoringIntervalMs) {
            await this.cleanupOldMetrics();
          }
        } catch (error) {
          console.error("Error during metrics collection:", error);
        }
      }, this.monitoringIntervalMs);

      console.log(
        `Monitoring service started with ${this.monitoringIntervalMs}ms interval`
      );
      console.log(`Monitoring ${this.endpoints.length} active endpoints`);
      return true;
    } catch (error) {
      console.error("Failed to start monitoring service:", error);
      return false;
    }
  }

  /**
   * Stop the monitoring service
   * @returns {boolean} Success status
   */
  stop() {
    if (!this.isRunning) {
      console.log("Monitoring service is not running");
      return false;
    }

    clearInterval(this.monitoringInterval);
    this.isRunning = false;
    console.log("Monitoring service stopped");
    return true;
  }

  /**
   * Load active endpoints from the database
   * @returns {Promise<Array>} Array of active endpoints
   */
  async loadEndpoints() {
    try {
      this.endpoints = await Endpoint.findAll({
        where: { isActive: true },
      });
      return this.endpoints;
    } catch (error) {
      console.error("Error loading endpoints:", error);
      throw error;
    }
  }

  /**
   * Collect metrics for all endpoints
   * @returns {Promise<void>}
   */
  async collectAllMetrics() {
    console.log(`Collecting metrics for ${this.endpoints.length} endpoints...`);

    // First refresh the endpoints list to get any changes
    await this.loadEndpoints();

    // Collect metrics for each endpoint in parallel
    const metricsPromises = this.endpoints.map((endpoint) =>
      this.collectEndpointMetrics(endpoint)
    );

    // Wait for all metrics to be collected
    await Promise.allSettled(metricsPromises);

    console.log("Metrics collection completed");
  }

  /**
   * Collect metrics for a single endpoint
   * @param {Object} endpoint - Endpoint object from database
   * @returns {Promise<Object>} Collected metrics
   */
  async collectEndpointMetrics(endpoint) {
    const startTime = Date.now();
    const metric = {
      endpointId: endpoint.id,
      timestamp: new Date(),
      success: false,
      requestCount: 1,
      metaData: {},
    };

    try {
      // Construct URL (use baseUrl if provided, otherwise just use the path)
      const url = endpoint.baseUrl
        ? `${endpoint.baseUrl}${endpoint.path}`
        : endpoint.path;

      // Make the request
      console.log(`Monitoring endpoint: ${endpoint.method} ${url}`);

      const response = await this.httpClient({
        method: endpoint.method,
        url,
        validateStatus: () => true, // Accept all status codes to track errors
      });

      // Calculate response time
      const responseTime = Date.now() - startTime;

      // Store metric data
      metric.responseTime = responseTime;
      metric.statusCode = response.status;
      metric.success = response.status >= 200 && response.status < 400;
      metric.metaData = {
        headers: response.headers,
        contentLength: response.headers["content-length"],
        contentType: response.headers["content-type"],
      };

      // Save metric to database
      await Metric.create(metric);

      // Check if metric exceeds thresholds and create alert if needed
      await this.checkThresholds(endpoint, metric);

      return metric;
    } catch (error) {
      // Handle request errors
      console.error(
        `Error monitoring endpoint ${endpoint.path}:`,
        error.message
      );

      // Set error details
      metric.success = false;
      metric.errorMessage = error.message;
      metric.statusCode = error.response?.status || 0;

      // Save error metric to database
      await Metric.create(metric);

      // Create incident and alert for the error
      await this.createIncidentFromError(endpoint, error, metric);

      return metric;
    }
  }

  /**
   * Check if metric exceeds thresholds and create alert if needed
   * @param {Object} endpoint - Endpoint object
   * @param {Object} metric - Collected metric
   * @returns {Promise<void>}
   */
  async checkThresholds(endpoint, metric) {
    // Check for response time threshold
    if (metric.responseTime > endpoint.responseTimeThreshold) {
      await this.createAlert({
        endpointId: endpoint.id,
        type: "RESPONSE_TIME",
        message: `Response time (${metric.responseTime}ms) exceeds threshold (${endpoint.responseTimeThreshold}ms)`,
        value: metric.responseTime,
        threshold: endpoint.responseTimeThreshold,
      });
    }

    // Check for error status codes
    if (!metric.success) {
      await this.createAlert({
        endpointId: endpoint.id,
        type: "STATUS_CODE",
        message: `Received error status code: ${metric.statusCode}`,
        value: metric.statusCode,
        threshold: 400, // 400+ are error codes
      });
    }

    // Check for error rate over last hour
    await this.checkErrorRate(endpoint);

    // Check for availability over last hour
    await this.checkAvailability(endpoint);
  }

  /**
   * Check error rate for an endpoint over the last hour
   * @param {Object} endpoint - Endpoint object
   * @returns {Promise<void>}
   */
  async checkErrorRate(endpoint) {
    try {
      const oneHourAgo = moment().subtract(1, "hour").toDate();

      // Get metrics from the last hour
      const metrics = await Metric.findAll({
        where: {
          endpointId: endpoint.id,
          timestamp: { [Op.gte]: oneHourAgo },
        },
      });

      if (metrics.length === 0) return;

      // Calculate error rate
      const totalMetrics = metrics.length;
      const errorMetrics = metrics.filter((m) => !m.success).length;
      const errorRate = (errorMetrics / totalMetrics) * 100;

      // Check if error rate exceeds threshold
      if (errorRate > endpoint.errorRateThreshold) {
        // Create alert
        await this.createAlert({
          endpointId: endpoint.id,
          type: "ERROR_RATE",
          message: `Error rate (${errorRate.toFixed(2)}%) exceeds threshold (${
            endpoint.errorRateThreshold
          }%)`,
          value: errorRate,
          threshold: endpoint.errorRateThreshold,
        });

        // Create incident if error rate is significantly high
        if (errorRate > endpoint.errorRateThreshold * 2) {
          await this.createIncident({
            endpointId: endpoint.id,
            title: `High Error Rate for ${endpoint.path}`,
            message: `Error rate of ${errorRate.toFixed(
              2
            )}% exceeds twice the threshold of ${endpoint.errorRateThreshold}%`,
            severity: "HIGH",
          });
        }
      }
    } catch (error) {
      console.error(
        `Error checking error rate for endpoint ${endpoint.id}:`,
        error
      );
    }
  }

  /**
   * Check availability for an endpoint over the last hour
   * @param {Object} endpoint - Endpoint object
   * @returns {Promise<void>}
   */
  async checkAvailability(endpoint) {
    try {
      const oneHourAgo = moment().subtract(1, "hour").toDate();

      // Get metrics from the last hour
      const metrics = await Metric.findAll({
        where: {
          endpointId: endpoint.id,
          timestamp: { [Op.gte]: oneHourAgo },
        },
      });

      if (metrics.length === 0) return;

      // Calculate availability
      const totalMetrics = metrics.length;
      const successMetrics = metrics.filter((m) => m.success).length;
      const availability = (successMetrics / totalMetrics) * 100;

      // Check if availability is below threshold
      if (availability < endpoint.availabilityThreshold) {
        // Create alert
        await this.createAlert({
          endpointId: endpoint.id,
          type: "AVAILABILITY",
          message: `Availability (${availability.toFixed(
            2
          )}%) is below threshold (${endpoint.availabilityThreshold}%)`,
          value: availability,
          threshold: endpoint.availabilityThreshold,
        });

        // Create incident if availability is significantly low
        if (availability < endpoint.availabilityThreshold - 10) {
          await this.createIncident({
            endpointId: endpoint.id,
            title: `Low Availability for ${endpoint.path}`,
            message: `Availability of ${availability.toFixed(
              2
            )}% is significantly below threshold of ${
              endpoint.availabilityThreshold
            }%`,
            severity: "HIGH",
          });
        }
      }
    } catch (error) {
      console.error(
        `Error checking availability for endpoint ${endpoint.id}:`,
        error
      );
    }
  }

  /**
   * Create an alert
   * @param {Object} alertData - Alert data
   * @returns {Promise<Object>} Created alert
   */
  async createAlert(alertData) {
    try {
      // Check if similar alert already exists
      const existingAlert = await Alert.findOne({
        where: {
          endpointId: alertData.endpointId,
          type: alertData.type,
          status: { [Op.ne]: "RESOLVED" },
          createdAt: { [Op.gte]: moment().subtract(1, "hour").toDate() },
        },
      });

      // If similar alert exists, don't create a new one
      if (existingAlert) {
        return existingAlert;
      }

      // Create new alert
      return await Alert.create(alertData);
    } catch (error) {
      console.error("Error creating alert:", error);
    }
  }

  /**
   * Create an incident from error
   * @param {Object} endpoint - Endpoint object
   * @param {Error} error - Error object
   * @param {Object} metric - Metric data
   * @returns {Promise<Object>} Created incident
   */
  async createIncidentFromError(endpoint, error, metric) {
    try {
      // Check if there's already an open incident for this endpoint
      const existingIncident = await Incident.findOne({
        where: {
          endpointId: endpoint.id,
          status: { [Op.ne]: "RESOLVED" },
        },
      });

      // If incident already exists, don't create a new one
      if (existingIncident) {
        return existingIncident;
      }

      // Create new incident
      const incident = await Incident.create({
        endpointId: endpoint.id,
        title: `Error detected for ${endpoint.path}`,
        message: error.message || "Unknown error",
        startTime: new Date(),
        status: "OPEN",
        severity: "MEDIUM",
        statusCode: metric.statusCode || error.response?.status,
      });

      // Create alert linked to this incident
      await Alert.create({
        endpointId: endpoint.id,
        incidentId: incident.id,
        type: "STATUS_CODE",
        message: `Error detected: ${error.message || "Unknown error"}`,
        status: "NEW",
      });

      return incident;
    } catch (error) {
      console.error("Error creating incident:", error);
    }
  }

  /**
   * Create a new incident
   * @param {Object} incidentData - Incident data
   * @returns {Promise<Object>} Created incident
   */
  async createIncident(incidentData) {
    try {
      // Check if there's already an open incident for this endpoint
      const existingIncident = await Incident.findOne({
        where: {
          endpointId: incidentData.endpointId,
          status: { [Op.ne]: "RESOLVED" },
        },
      });

      // If incident already exists, don't create a new one
      if (existingIncident) {
        return existingIncident;
      }

      // Create new incident
      const incident = await Incident.create({
        ...incidentData,
        startTime: new Date(),
        status: "OPEN",
      });

      // Create alert linked to this incident
      await Alert.create({
        endpointId: incidentData.endpointId,
        incidentId: incident.id,
        type: incidentData.type || "OTHER",
        message: incidentData.message,
        status: "NEW",
      });

      return incident;
    } catch (error) {
      console.error("Error creating incident:", error);
    }
  }

  /**
   * Collect system status
   * @returns {Promise<Object>} System status
   */
  async collectSystemStatus() {
    try {
      // Collect system metrics
      const cpuUsage = process.cpuUsage();
      const memoryUsage = process.memoryUsage();

      const systemStatus = {
        timestamp: new Date(),
        cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
        memoryUsage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100, // Percentage
        diskUsage: 0, // Would need a library to measure actual disk usage
        networkUsage: 0, // Would need additional metrics collection
        activeConnections: 0, // Would need server stats
        uptime: process.uptime(),
        additionalMetrics: {
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          loadAverage: os.loadavg(),
          cpuCount: os.cpus().length,
        },
      };

      // Store in database
      await SystemStatus.create(systemStatus);

      return systemStatus;
    } catch (error) {
      console.error("Error collecting system status:", error);
    }
  }

  /**
   * Clean up old metrics (older than 30 days)
   * @returns {Promise<number>} Number of deleted metrics
   */
  async cleanupOldMetrics() {
    try {
      const cutoffDate = moment().subtract(30, "days").toDate();

      // Delete old metrics
      const deletedMetrics = await Metric.destroy({
        where: {
          timestamp: { [Op.lt]: cutoffDate },
        },
      });

      console.log(`Cleaned up ${deletedMetrics} old metrics`);
      return deletedMetrics;
    } catch (error) {
      console.error("Error cleaning up old metrics:", error);
      return 0;
    }
  }

  /**
   * Get monitoring overview (for dashboard)
   * @returns {Promise<Object>} Monitoring overview
   */
  async getMonitoringOverview() {
    try {
      // Get counts
      const totalEndpoints = await Endpoint.count();
      const activeEndpoints = await Endpoint.count({
        where: { isActive: true },
      });
      const openIncidents = await Incident.count({
        where: { status: { [Op.ne]: "RESOLVED" } },
      });
      const newAlerts = await Alert.count({ where: { status: "NEW" } });

      // Get latest system status
      const systemStatus = await SystemStatus.findOne({
        order: [["timestamp", "DESC"]],
      });

      // Get uptime data
      const oneDayAgo = moment().subtract(1, "day").toDate();
      const metrics = await Metric.findAll({
        where: {
          timestamp: { [Op.gte]: oneDayAgo },
        },
        attributes: ["endpointId", "success"],
        include: [
          {
            model: Endpoint,
            attributes: ["path"],
          },
        ],
      });

      // Calculate uptime percentage
      const uptimeByEndpoint = {};
      metrics.forEach((metric) => {
        const endpointPath = metric.Endpoint.path;
        if (!uptimeByEndpoint[endpointPath]) {
          uptimeByEndpoint[endpointPath] = { total: 0, success: 0 };
        }
        uptimeByEndpoint[endpointPath].total += 1;
        if (metric.success) {
          uptimeByEndpoint[endpointPath].success += 1;
        }
      });

      // Calculate overall uptime
      let totalRequests = 0;
      let successfulRequests = 0;
      Object.values(uptimeByEndpoint).forEach((data) => {
        totalRequests += data.total;
        successfulRequests += data.success;
      });

      const overallUptime = totalRequests
        ? (successfulRequests / totalRequests) * 100
        : 100;

      return {
        totalEndpoints,
        activeEndpoints,
        openIncidents,
        newAlerts,
        systemStatus: systemStatus || {},
        uptime: {
          overall: parseFloat(overallUptime.toFixed(2)),
          byEndpoint: Object.entries(uptimeByEndpoint).map(([path, data]) => ({
            path,
            uptime: parseFloat(((data.success / data.total) * 100).toFixed(2)),
            total: data.total,
          })),
        },
        status: this.isRunning ? "running" : "stopped",
        lastUpdated: new Date(),
      };
    } catch (error) {
      console.error("Error getting monitoring overview:", error);
      throw error;
    }
  }

  /**
   * Get detailed metrics for an endpoint
   * @param {number} endpointId - Endpoint ID
   * @param {string} timeRange - Time range (e.g., '1h', '24h', '7d')
   * @returns {Promise<Object>} Detailed metrics
   */
  async getEndpointMetrics(endpointId, timeRange = "24h") {
    try {
      // Parse time range
      const timeParts = timeRange.match(/^(\d+)([hdwmy])$/);
      if (!timeParts) {
        throw new Error(
          "Invalid time range format. Use format like 1h, 24h, 7d, etc."
        );
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

      // Get endpoint
      const endpoint = await Endpoint.findByPk(endpointId);
      if (!endpoint) {
        throw new Error("Endpoint not found");
      }

      // Get metrics for the time range
      const metrics = await Metric.findAll({
        where: {
          endpointId,
          timestamp: { [Op.gte]: startTime },
        },
        order: [["timestamp", "ASC"]],
      });

      // Process metrics
      const timePoints = [];
      const responseTimeSeries = [];
      const successRateSeries = [];
      const requestCountMap = new Map();

      // Group metrics by hour
      metrics.forEach((metric) => {
        const hourKey = moment(metric.timestamp).format("YYYY-MM-DD HH:00:00");

        if (!requestCountMap.has(hourKey)) {
          requestCountMap.set(hourKey, {
            total: 0,
            success: 0,
            responseTimes: [],
          });
        }

        const data = requestCountMap.get(hourKey);
        data.total += 1;
        if (metric.success) {
          data.success += 1;
        }
        if (metric.responseTime) {
          data.responseTimes.push(metric.responseTime);
        }
      });

      // Convert to time series
      requestCountMap.forEach((data, hourKey) => {
        timePoints.push(moment(hourKey).format("HH:mm"));

        const avgResponseTime = data.responseTimes.length
          ? data.responseTimes.reduce((sum, time) => sum + time, 0) /
            data.responseTimes.length
          : 0;

        responseTimeSeries.push(Math.round(avgResponseTime));
        successRateSeries.push(
          parseFloat(((data.success / data.total) * 100).toFixed(2))
        );
      });

      // Get status code distribution
      const statusCodes = {};
      metrics.forEach((metric) => {
        if (metric.statusCode) {
          statusCodes[metric.statusCode] =
            (statusCodes[metric.statusCode] || 0) + 1;
        }
      });

      // Convert counts to percentages
      const totalMetrics = metrics.length;
      const statusCodePercentages = {};

      Object.entries(statusCodes).forEach(([code, count]) => {
        statusCodePercentages[code] = parseFloat(
          ((count / totalMetrics) * 100).toFixed(1)
        );
      });

      // Calculate overall stats
      const totalRequests = metrics.length;
      const successfulRequests = metrics.filter((m) => m.success).length;
      const avgResponseTime = metrics.length
        ? metrics.reduce((sum, m) => sum + (m.responseTime || 0), 0) /
          metrics.length
        : 0;
      const successRate = totalRequests
        ? (successfulRequests / totalRequests) * 100
        : 100;

      return {
        endpoint: {
          id: endpoint.id,
          path: endpoint.path,
          method: endpoint.method,
          description: endpoint.description,
          responseTimeThreshold: endpoint.responseTimeThreshold,
          errorRateThreshold: endpoint.errorRateThreshold,
          availabilityThreshold: endpoint.availabilityThreshold,
        },
        timeRange,
        metrics: {
          totalRequests,
          timePoints,
          responseTimeSeries,
          successRateSeries,
          statusCodePercentages,
          avgResponseTime: Math.round(avgResponseTime),
          successRate: parseFloat(successRate.toFixed(2)),
        },
        // Get related incidents
        incidents: await Incident.findAll({
          where: {
            endpointId,
            startTime: { [Op.gte]: startTime },
          },
          order: [["startTime", "DESC"]],
        }),
        // Get related alerts
        alerts: await Alert.findAll({
          where: {
            endpointId,
            timestamp: { [Op.gte]: startTime },
          },
          order: [["timestamp", "DESC"]],
        }),
      };
    } catch (error) {
      console.error(
        `Error getting endpoint metrics for endpoint ${endpointId}:`,
        error
      );
      throw error;
    }
  }

  async calculateEndpointHealthScore(endpointId) {
    try {
      const endpoint = await Endpoint.findByPk(endpointId);
      if (!endpoint) {
        throw new Error("Endpoint not found");
      }

      // Get metrics from the last 24 hours
      const oneDayAgo = moment().subtract(1, "day").toDate();
      const metrics = await Metric.findAll({
        where: {
          endpointId,
          timestamp: { [Op.gte]: oneDayAgo },
        },
      });

      if (metrics.length === 0) {
        return { score: null, details: "No data available" };
      }

      // Calculate components of health score

      // 1. Availability (40% of score)
      const successfulRequests = metrics.filter((m) => m.success).length;
      const availabilityScore = (successfulRequests / metrics.length) * 40;

      // 2. Response time (30% of score)
      const avgResponseTime =
        metrics.reduce((sum, m) => sum + (m.responseTime || 0), 0) /
        metrics.length;
      const responseTimeRatio = Math.min(
        1,
        endpoint.responseTimeThreshold / (avgResponseTime || 1)
      );
      const responseTimeScore = responseTimeRatio * 30;

      // 3. Error rate (20% of score)
      const errorRate =
        ((metrics.length - successfulRequests) / metrics.length) * 100;
      const errorRateRatio = Math.min(
        1,
        endpoint.errorRateThreshold / (errorRate || 0.1)
      );
      const errorRateScore = errorRateRatio * 20;

      // 4. Stability (10% of score) - variation in response times
      const responseTimeValues = metrics
        .map((m) => m.responseTime || 0)
        .filter((t) => t > 0);

      // Calculate standard deviation directly instead of using helper function
      const responseTimeAvg =
        responseTimeValues.reduce((sum, val) => sum + val, 0) /
        responseTimeValues.length;
      const squareDiffs = responseTimeValues.map((value) =>
        Math.pow(value - responseTimeAvg, 2)
      );
      const avgSquareDiff =
        squareDiffs.reduce((sum, val) => sum + val, 0) / squareDiffs.length;
      const stdDeviation = Math.sqrt(avgSquareDiff);

      const variabilityRatio = Math.min(1, 100 / (stdDeviation || 1));
      const stabilityScore = variabilityRatio * 10;

      // Calculate total score
      const totalScore = Math.round(
        availabilityScore + responseTimeScore + errorRateScore + stabilityScore
      );

      return {
        score: totalScore,
        details: {
          availability: Math.round(availabilityScore / 0.4), // Convert back to percentage
          responseTime: Math.round(avgResponseTime),
          errorRate: Math.round(errorRate * 10) / 10, // One decimal point
          stability: Math.round(100 - (stdDeviation / avgResponseTime) * 100),
          metrics: metrics.length,
        },
      };
    } catch (error) {
      console.error(
        `Error calculating health score for endpoint ${endpointId}:`,
        error
      );
      throw error;
    }
  }
}

// Create singleton instance
const monitorService = new MonitorService();

module.exports = monitorService;
