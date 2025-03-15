/**
 * Models index file
 * Defines all Sequelize models for the application
 */

const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// ==========================================
// Endpoint Model
// ==========================================
const Endpoint = sequelize.define("Endpoint", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  path: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true,
    },
  },
  method: {
    type: DataTypes.ENUM("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"),
    allowNull: false,
    defaultValue: "GET",
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  responseTimeThreshold: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 500, // milliseconds
    validate: {
      min: 0,
    },
  },
  errorRateThreshold: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 1.0, // percentage
    validate: {
      min: 0,
      max: 100,
    },
  },
  availabilityThreshold: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 99.9, // percentage
    validate: {
      min: 0,
      max: 100,
    },
  },
  baseUrl: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },

  tags: {
    type: DataTypes.STRING(255),
    allowNull: true,
    get() {
      const value = this.getDataValue("tags");
      return value ? value.split(",") : [];
    },

    set(val) {
      if (Array.isArray(val)) {
        this.setDataValue("tags", val.join(","));
      } else {
        this.setDataValue("tags", val);
      }
    },
  },
});

// ==========================================
// Metric Model
// ==========================================
const Metric = sequelize.define("Metric", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  endpointId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Endpoint,
      key: "id",
    },
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  responseTime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0,
    },
  },
  statusCode: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  success: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  requestCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: {
      min: 0,
    },
  },
  // Store additional metric data as JSON
  metaData: {
    type: DataTypes.JSON,
    allowNull: true,
  },
});

// ==========================================
// Incident Model
// ==========================================
const Incident = sequelize.define("Incident", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  endpointId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Endpoint,
      key: "id",
    },
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM("OPEN", "ACKNOWLEDGED", "RESOLVED"),
    allowNull: false,
    defaultValue: "OPEN",
  },
  severity: {
    type: DataTypes.ENUM("LOW", "MEDIUM", "HIGH", "CRITICAL"),
    allowNull: false,
    defaultValue: "MEDIUM",
  },
  statusCode: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  resolvedBy: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  resolution: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
});

// ==========================================
// Alert Model
// ==========================================
const Alert = sequelize.define("Alert", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  endpointId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Endpoint,
      key: "id",
    },
  },
  incidentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Incident,
      key: "id",
    },
  },
  type: {
    type: DataTypes.ENUM(
      "RESPONSE_TIME",
      "ERROR_RATE",
      "AVAILABILITY",
      "STATUS_CODE",
      "OTHER"
    ),
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  value: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  threshold: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM("NEW", "ACKNOWLEDGED", "RESOLVED"),
    allowNull: false,
    defaultValue: "NEW",
  },
  acknowledgedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  acknowledgedBy: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
});

// ==========================================
// User Model (for dashboard authentication)
// ==========================================
const User = sequelize.define("User", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      len: [3, 50],
    },
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM("ADMIN", "USER", "VIEWER"),
    allowNull: false,
    defaultValue: "VIEWER",
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});

// ==========================================
// System Status Model
// ==========================================
const SystemStatus = sequelize.define("SystemStatus", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  cpuUsage: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  memoryUsage: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  diskUsage: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  networkUsage: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  activeConnections: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  uptime: {
    type: DataTypes.INTEGER, // in seconds
    allowNull: true,
  },
  // Additional system metrics as JSON
  additionalMetrics: {
    type: DataTypes.JSON,
    allowNull: true,
  },
});

// ==========================================
// Security Alert Model
// ==========================================

const SecurityAlert = sequelize.define("SecurityAlert", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  endpointId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Endpoint,
      key: "id",
    },
  },
  type: {
    type: DataTypes.ENUM(
      "VULNERABILITY",
      "RATE_LIMIT",
      "AUTH_FAILURE",
      "SENSITIVE_DATA"
    ),
    allowNull: false,
  },
  severity: {
    type: DataTypes.ENUM("LOW", "MEDIUM", "HIGH", "CRITICAL"),
    allowNull: false,
    defaultValue: "MEDIUM",
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  details: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  status: {
    type: DataTypes.ENUM("NEW", "ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"),
    allowNull: false,
    defaultValue: "NEW",
  },
  resolvedBy: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  resolvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});

// ==========================================
// Define Relationships
// ==========================================

// Endpoint to Metrics (One-to-Many)
Endpoint.hasMany(Metric, { foreignKey: "endpointId", onDelete: "CASCADE" });
Metric.belongsTo(Endpoint, { foreignKey: "endpointId" });

// Endpoint to Incidents (One-to-Many)
Endpoint.hasMany(Incident, { foreignKey: "endpointId", onDelete: "CASCADE" });
Incident.belongsTo(Endpoint, { foreignKey: "endpointId" });

// Endpoint to Alerts (One-to-Many)
Endpoint.hasMany(Alert, { foreignKey: "endpointId", onDelete: "CASCADE" });
Alert.belongsTo(Endpoint, { foreignKey: "endpointId" });

// Incident to Alerts (One-to-Many)
Incident.hasMany(Alert, { foreignKey: "incidentId", onDelete: "SET NULL" });
Alert.belongsTo(Incident, { foreignKey: "incidentId" });

// SecurityAlert to Endpoint (One-to-Many)
Endpoint.hasMany(SecurityAlert, {
  foreignKey: "endpointId",
  onDelete: "CASCADE",
});
SecurityAlert.belongsTo(Endpoint, { foreignKey: "endpointId" });

// ==========================================
// Export models
// ==========================================
module.exports = {
  Endpoint,
  Metric,
  Incident,
  Alert,
  User,
  SystemStatus,
  SecurityAlert,
};
