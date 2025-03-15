/**
 * Security Monitor Service
 * Handles API security scanning, rate limiting detection, auth failures, and PII exposure
 */

const { Op } = require("sequelize");
const moment = require("moment");
const { Endpoint, Metric, SecurityAlert } = require("../models");
const { sequelize } = require("../config/database");

class SecurityMonitorService {
  constructor() {
    this.isRunning = false;
    this.monitoringInterval = null;
    this.monitoringIntervalMs =
      process.env.SECURITY_MONITORING_INTERVAL || 120000; // 2 minutes default
    this.sensitiveDataPatterns = [
      {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        type: "EMAIL",
      },
      { pattern: /\b(?:\d[ -]*?){13,16}\b/g, type: "CREDIT_CARD" },
      { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, type: "SSN" },
      {
        pattern:
          /\bpassword\s*[:=]\s*['"][^'"]+['"]|\bapikey\s*[:=]\s*['"][^'"]+['"]|\bsecret\s*[:=]\s*['"][^'"]+['"]|\btoken\s*[:=]\s*['"][^'"]+['"]|\bauth\s*[:=]\s*['"][^'"]+['"]|\bjwt\s*[:=]\s*['"][^'"]+['"]|\baccess_token\s*[:=]\s*['"][^'"]+['"]|\brefresh_token\s*[:=]\s*['"][^'"]+['"]|\b[a-zA-Z0-9_\-]{21,}\.[a-zA-Z0-9_\-]{6,}\.[a-zA-Z0-9_\-]{27,}\b/g,
        type: "SECRET",
      },
      {
        pattern: /\b(?:\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
        type: "PHONE",
      },
    ];
  }

  /**
   * Start the security monitoring service
   */
  async start() {
    if (this.isRunning) {
      console.log("Security monitoring service is already running");
      return false;
    }

    try {
      this.isRunning = true;

      // Initial security scan
      await this.performSecurityScan();

      // Create interval for continuous monitoring
      this.monitoringInterval = setInterval(async () => {
        try {
          await this.performSecurityScan();
        } catch (error) {
          console.error("Error during security scan:", error);
        }
      }, this.monitoringIntervalMs);

      console.log(
        `Security monitoring service started with ${this.monitoringIntervalMs}ms interval`
      );
      return true;
    } catch (error) {
      console.error("Failed to start security monitoring service:", error);
      this.isRunning = false;
      return false;
    }
  }

  /**
   * Stop the security monitoring service
   */
  stop() {
    if (!this.isRunning) {
      console.log("Security monitoring service is not running");
      return false;
    }

    clearInterval(this.monitoringInterval);
    this.isRunning = false;
    console.log("Security monitoring service stopped");
    return true;
  }

  /**
   * Perform a complete security scan
   */
  async performSecurityScan() {
    console.log("Starting security scan...");

    try {
      const endpoints = await Endpoint.findAll({
        where: { isActive: true },
      });

      for (const endpoint of endpoints) {
        // Run all security checks
        await this.detectRateLimiting(endpoint);
        await this.monitorAuthFailures(endpoint);
        await this.scanSensitiveData(endpoint);
        await this.vulnerabilityScan(endpoint);
      }

      console.log("Security scan completed");
    } catch (error) {
      console.error("Error in security scan:", error);
      throw error;
    }
  }

  /**
   * Detect potential rate limiting or DDoS attempts
   */
  async detectRateLimiting(endpoint) {
    try {
      const fiveMinutesAgo = moment().subtract(5, "minutes").toDate();

      // Get recent metrics grouped by minute
      const metrics = await Metric.findAll({
        attributes: [
          [sequelize.fn("YEAR", sequelize.col("timestamp")), "year"],
          [sequelize.fn("MONTH", sequelize.col("timestamp")), "month"],
          [sequelize.fn("DAY", sequelize.col("timestamp")), "day"],
          [sequelize.fn("HOUR", sequelize.col("timestamp")), "hour"],
          [sequelize.fn("MINUTE", sequelize.col("timestamp")), "minute"],
          [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        where: {
          endpointId: endpoint.id,
          timestamp: { [Op.gte]: fiveMinutesAgo },
        },
        group: [
          sequelize.fn("YEAR", sequelize.col("timestamp")),
          sequelize.fn("MONTH", sequelize.col("timestamp")),
          sequelize.fn("DAY", sequelize.col("timestamp")),
          sequelize.fn("HOUR", sequelize.col("timestamp")),
          sequelize.fn("MINUTE", sequelize.col("timestamp")),
        ],
        order: [
          [sequelize.fn("YEAR", sequelize.col("timestamp")), "ASC"],
          [sequelize.fn("MONTH", sequelize.col("timestamp")), "ASC"],
          [sequelize.fn("DAY", sequelize.col("timestamp")), "ASC"],
          [sequelize.fn("HOUR", sequelize.col("timestamp")), "ASC"],
          [sequelize.fn("MINUTE", sequelize.col("timestamp")), "ASC"],
        ],
        raw: true,
      });

      // Analyze for rate limiting (more than 100 requests per minute)
      const threshold = 100; // Configurable
      for (const metricGroup of metrics) {
        if (metricGroup.count > threshold) {
          // Check if a similar alert already exists
          const existingAlert = await SecurityAlert.findOne({
            where: {
              endpointId: endpoint.id,
              type: "RATE_LIMIT",
              status: { [Op.ne]: "RESOLVED" },
              timestamp: { [Op.gte]: moment().subtract(1, "hour").toDate() },
            },
          });

          if (!existingAlert) {
            // Create a new alert
            await SecurityAlert.create({
              endpointId: endpoint.id,
              type: "RATE_LIMIT",
              severity: metricGroup.count > threshold * 2 ? "HIGH" : "MEDIUM",
              message: `Potential rate limiting or DDoS attempt detected: ${metricGroup.count} requests in one minute`,
              details: {
                requestCount: metricGroup.count,
                threshold: threshold,
                minute: `${metricGroup.year}-${metricGroup.month}-${metricGroup.day} ${metricGroup.hour}:${metricGroup.minute}`,
              },
            });

            console.log(
              `Rate limiting alert created for endpoint ${endpoint.id}`
            );
          }
        }
      }
    } catch (error) {
      console.error(
        `Error detecting rate limiting for endpoint ${endpoint.id}:`,
        error
      );
    }
  }

  /**
   * Monitor authentication failures
   */
  async monitorAuthFailures(endpoint) {
    try {
      const oneDayAgo = moment().subtract(1, "day").toDate();

      // Get auth failure metrics (401, 403 status codes)
      const authFailures = await Metric.findAll({
        where: {
          endpointId: endpoint.id,
          timestamp: { [Op.gte]: oneDayAgo },
          [Op.or]: [{ statusCode: 401 }, { statusCode: 403 }],
        },
      });

      // If more than 5 auth failures in a day, create an alert
      if (authFailures.length >= 5) {
        // Check if a similar alert already exists
        const existingAlert = await SecurityAlert.findOne({
          where: {
            endpointId: endpoint.id,
            type: "AUTH_FAILURE",
            status: { [Op.ne]: "RESOLVED" },
            timestamp: { [Op.gte]: oneDayAgo },
          },
        });

        if (!existingAlert) {
          // Create a new alert
          await SecurityAlert.create({
            endpointId: endpoint.id,
            type: "AUTH_FAILURE",
            severity: authFailures.length > 20 ? "HIGH" : "MEDIUM",
            message: `Unusual number of authentication failures: ${authFailures.length} in the last 24 hours`,
            details: {
              failureCount: authFailures.length,
              statusCodes: {
                unauthorized: authFailures.filter((m) => m.statusCode === 401)
                  .length,
                forbidden: authFailures.filter((m) => m.statusCode === 403)
                  .length,
              },
            },
          });

          console.log(`Auth failure alert created for endpoint ${endpoint.id}`);
        }
      }
    } catch (error) {
      console.error(
        `Error monitoring auth failures for endpoint ${endpoint.id}:`,
        error
      );
    }
  }

  /**
   * Scan for sensitive data exposure in responses
   */
  async scanSensitiveData(endpoint) {
    try {
      const oneHourAgo = moment().subtract(1, "hour").toDate();

      // Get recent metrics with response data
      const metrics = await Metric.findAll({
        where: {
          endpointId: endpoint.id,
          timestamp: { [Op.gte]: oneHourAgo },
          [Op.not]: {
            metaData: null,
          },
        },
        limit: 100, // Limit to 100 most recent metrics
      });

      for (const metric of metrics) {
        // Skip if no metaData or no response data
        if (!metric.metaData || !metric.metaData.responseData) continue;

        const responseData =
          typeof metric.metaData.responseData === "string"
            ? metric.metaData.responseData
            : JSON.stringify(metric.metaData.responseData);

        // Check for sensitive data patterns
        const foundPatterns = [];
        for (const pattern of this.sensitiveDataPatterns) {
          const matches = responseData.match(pattern.pattern);
          if (matches && matches.length > 0) {
            foundPatterns.push({
              type: pattern.type,
              count: matches.length,
            });
          }
        }

        if (foundPatterns.length > 0) {
          // Check if a similar alert already exists
          const existingAlert = await SecurityAlert.findOne({
            where: {
              endpointId: endpoint.id,
              type: "SENSITIVE_DATA",
              status: { [Op.ne]: "RESOLVED" },
              timestamp: { [Op.gte]: oneHourAgo },
            },
          });

          if (!existingAlert) {
            // Create a new alert
            await SecurityAlert.create({
              endpointId: endpoint.id,
              type: "SENSITIVE_DATA",
              severity: "HIGH",
              message: `Sensitive data exposure detected in API response`,
              details: {
                detectedTypes: foundPatterns,
                metricId: metric.id,
                timestamp: metric.timestamp,
              },
            });

            console.log(
              `Sensitive data alert created for endpoint ${endpoint.id}`
            );
          }
        }
      }
    } catch (error) {
      console.error(
        `Error scanning for sensitive data for endpoint ${endpoint.id}:`,
        error
      );
    }
  }

  /**
   * Scan for common API vulnerabilities
   */
  async vulnerabilityScan(endpoint) {
    try {
      // This would typically involve more complex security scanning
      // For demonstration, we'll check for common security headers
      const oneHourAgo = moment().subtract(1, "hour").toDate();

      // Get recent metrics with headers
      const metrics = await Metric.findAll({
        where: {
          endpointId: endpoint.id,
          timestamp: { [Op.gte]: oneHourAgo },
          [Op.not]: {
            metaData: null,
          },
        },
        limit: 10, // Limit to 10 most recent metrics
      });

      for (const metric of metrics) {
        // Skip if no metaData or no headers
        if (!metric.metaData || !metric.metaData.headers) continue;

        const headers = metric.metaData.headers;
        const missingSecurityHeaders = [];

        // Check for important security headers
        if (!headers["content-security-policy"])
          missingSecurityHeaders.push("Content-Security-Policy");
        if (!headers["x-content-type-options"])
          missingSecurityHeaders.push("X-Content-Type-Options");
        if (!headers["x-frame-options"])
          missingSecurityHeaders.push("X-Frame-Options");
        if (!headers["x-xss-protection"])
          missingSecurityHeaders.push("X-XSS-Protection");
        if (!headers["strict-transport-security"])
          missingSecurityHeaders.push("Strict-Transport-Security");

        if (missingSecurityHeaders.length >= 3) {
          // If 3 or more security headers are missing
          // Check if a similar alert already exists
          const existingAlert = await SecurityAlert.findOne({
            where: {
              endpointId: endpoint.id,
              type: "VULNERABILITY",
              status: { [Op.ne]: "RESOLVED" },
              timestamp: { [Op.gte]: oneHourAgo },
            },
          });

          if (!existingAlert) {
            // Create a new alert
            await SecurityAlert.create({
              endpointId: endpoint.id,
              type: "VULNERABILITY",
              severity: "MEDIUM",
              message: `Missing important security headers: ${missingSecurityHeaders.join(
                ", "
              )}`,
              details: {
                missingHeaders: missingSecurityHeaders,
                presentHeaders: Object.keys(headers),
                metricId: metric.id,
              },
            });

            console.log(
              `Vulnerability alert created for endpoint ${endpoint.id}`
            );
          }

          // Only create one alert per endpoint
          break;
        }
      }
    } catch (error) {
      console.error(
        `Error scanning for vulnerabilities for endpoint ${endpoint.id}:`,
        error
      );
    }
  }

  /**
   * Get security alerts
   */
  async getSecurityAlerts(options = {}) {
    try {
      const { endpointId, type, status, limit = 100, offset = 0 } = options;

      // Build query
      const query = {};
      if (endpointId) query.endpointId = endpointId;
      if (type) query.type = type;
      if (status) query.status = status;

      // Get alerts
      const alerts = await SecurityAlert.findAndCountAll({
        where: query,
        include: [
          {
            model: Endpoint,
            attributes: ["path", "method"],
          },
        ],
        order: [["timestamp", "DESC"]],
        limit,
        offset,
      });

      return {
        count: alerts.count,
        data: alerts.rows,
      };
    } catch (error) {
      console.error("Error getting security alerts:", error);
      throw error;
    }
  }

  /**
   * Update security alert status
   */
  async updateAlertStatus(alertId, status, resolvedBy = null) {
    try {
      const alert = await SecurityAlert.findByPk(alertId);

      if (!alert) {
        throw new Error("Security alert not found");
      }

      alert.status = status;

      if (status === "RESOLVED") {
        alert.resolvedBy = resolvedBy;
        alert.resolvedAt = new Date();
      }

      await alert.save();

      return alert;
    } catch (error) {
      console.error("Error updating security alert status:", error);
      throw error;
    }
  }

  /**
   * Get security overview for dashboard
   */
  async getSecurityOverview() {
    try {
      const oneDayAgo = moment().subtract(1, "day").toDate();

      // Get counts by type
      const alertCounts = await SecurityAlert.findAll({
        attributes: [
          "type",
          [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        where: {
          timestamp: { [Op.gte]: oneDayAgo },
        },
        group: ["type"],
        raw: true,
      });

      // Get counts by severity
      const severityCounts = await SecurityAlert.findAll({
        attributes: [
          "severity",
          [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        where: {
          timestamp: { [Op.gte]: oneDayAgo },
        },
        group: ["severity"],
        raw: true,
      });

      // Get active endpoints with security issues
      const endpointsWithIssues = await SecurityAlert.findAll({
        attributes: [
          "endpointId",
          [
            sequelize.fn("COUNT", sequelize.col("SecurityAlert.id")),
            "alertCount",
          ],
        ],
        where: {
          status: { [Op.ne]: "RESOLVED" },
        },
        group: ["endpointId"],
        order: [[sequelize.literal("alertCount"), "DESC"]],
        limit: 5,
        include: [
          {
            model: Endpoint,
            attributes: ["path", "method"],
          },
        ],
        raw: true,
      });

      return {
        totalAlerts: await SecurityAlert.count({
          where: {
            timestamp: { [Op.gte]: oneDayAgo },
          },
        }),
        unresolvedAlerts: await SecurityAlert.count({
          where: {
            status: { [Op.ne]: "RESOLVED" },
          },
        }),
        alertsByType: alertCounts,
        alertsBySeverity: severityCounts,
        topEndpointsWithIssues: endpointsWithIssues,
      };
    } catch (error) {
      console.error("Error getting security overview:", error);
      throw error;
    }
  }
}

// Create singleton instance
const securityMonitorService = new SecurityMonitorService();

module.exports = securityMonitorService;
