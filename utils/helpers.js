/**
 * Helper Utilities
 * Common utility functions for the API monitoring backend
 */

const moment = require("moment");
const crypto = require("crypto");

/**
 * Format date to ISO string with timezone
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
const formatDate = (date) => {
  return moment(date).format("YYYY-MM-DD HH:mm:ss");
};

/**
 * Calculate time difference with human-readable format
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date (defaults to now)
 * @returns {string} Formatted time difference
 */
const getTimeDifference = (startDate, endDate = new Date()) => {
  const start = moment(startDate);
  const end = moment(endDate);

  const diff = moment.duration(end.diff(start));

  const days = Math.floor(diff.asDays());
  const hours = diff.hours();
  const minutes = diff.minutes();
  const seconds = diff.seconds();

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
};

/**
 * Generate random ID
 * @param {number} length - Length of ID
 * @returns {string} Random ID
 */
const generateRandomId = (length = 10) => {
  return crypto.randomBytes(length).toString("hex");
};

/**
 * Filter sensitive data from objects
 * @param {Object} obj - Object to filter
 * @param {Array} sensitiveFields - Fields to remove
 * @returns {Object} Filtered object
 */
const filterSensitiveData = (
  obj,
  sensitiveFields = ["password", "token", "secret"]
) => {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  const filtered = { ...obj };

  sensitiveFields.forEach((field) => {
    if (field in filtered) {
      delete filtered[field];
    }
  });

  return filtered;
};

/**
 * Paginate results
 * @param {Array} items - Array of items
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Object} Paginated results
 */
const paginate = (items, page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  const paginatedItems = items.slice(offset, offset + limit);
  const totalPages = Math.ceil(items.length / limit);

  return {
    items: paginatedItems,
    page,
    limit,
    totalItems: items.length,
    totalPages,
  };
};

/**
 * Group items by key
 * @param {Array} items - Array of items
 * @param {string} key - Key to group by
 * @returns {Object} Grouped items
 */
const groupBy = (items, key) => {
  return items.reduce((result, item) => {
    const group = item[key];
    result[group] = result[group] || [];
    result[group].push(item);
    return result;
  }, {});
};

/**
 * Calculate average value from array of objects
 * @param {Array} items - Array of objects
 * @param {string} key - Key to average
 * @returns {number} Average value
 */
const calculateAverage = (items, key) => {
  if (!items || items.length === 0) {
    return 0;
  }

  const sum = items.reduce((total, item) => {
    return total + (parseFloat(item[key]) || 0);
  }, 0);

  return sum / items.length;
};

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} Is valid URL
 */
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Parse time range string to milliseconds
 * @param {string} timeRange - Time range string (e.g., '1h', '1d', '1w')
 * @returns {number} Milliseconds
 */
const parseTimeRange = (timeRange) => {
  const match = timeRange.match(/^(\d+)([hdwmy])$/);

  if (!match) {
    throw new Error(
      "Invalid time range format. Use format like 1h, 24h, 7d, etc."
    );
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case "h": // hours
      return value * 60 * 60 * 1000;
    case "d": // days
      return value * 24 * 60 * 60 * 1000;
    case "w": // weeks
      return value * 7 * 24 * 60 * 60 * 1000;
    case "m": // months (approximate)
      return value * 30 * 24 * 60 * 60 * 1000;
    case "y": // years (approximate)
      return value * 365 * 24 * 60 * 60 * 1000;
    default:
      throw new Error("Invalid time unit. Use h, d, w, m, or y.");
  }
};

/**
 * Ensure value is within range
 * @param {number} value - Value to check
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Value within range
 */
const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

/**
 * Convert status code to severity level
 * @param {number} statusCode - HTTP status code
 * @returns {string} Severity level
 */
const getStatusCodeSeverity = (statusCode) => {
  if (!statusCode) {
    return "MEDIUM";
  }

  if (statusCode >= 500) {
    return "HIGH";
  } else if (statusCode >= 400) {
    return "MEDIUM";
  } else {
    return "LOW";
  }
};

/**
 * Deep merge objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
const deepMerge = (target, source) => {
  if (!source) {
    return target;
  }

  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }

  return output;
};

/**
 * Check if value is an object
 * @param {*} item - Value to check
 * @returns {boolean} Is object
 */
const isObject = (item) => {
  return item && typeof item === "object" && !Array.isArray(item);
};

module.exports = {
  formatDate,
  getTimeDifference,
  generateRandomId,
  filterSensitiveData,
  paginate,
  groupBy,
  calculateAverage,
  isValidUrl,
  parseTimeRange,
  clamp,
  getStatusCodeSeverity,
  deepMerge,
};
