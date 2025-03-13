/**
 * Middleware index file
 * All middleware functions for the API
 */

const jwt = require("jsonwebtoken");
const { StatusCodes } = require("http-status-codes");

// ==========================================
// Error Handling Middleware
// ==========================================

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  // Default error status and message
  let statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  let message = err.message || "Internal Server Error";
  let errors = err.errors || null;

  // Handle Sequelize validation errors
  if (
    err.name === "SequelizeValidationError" ||
    err.name === "SequelizeUniqueConstraintError"
  ) {
    statusCode = StatusCodes.BAD_REQUEST;
    message = "Validation Error";
    errors = err.errors.map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    statusCode = StatusCodes.UNAUTHORIZED;
    message = "Authentication Error";
  }

  // Send error response
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};

/**
 * Not found middleware for undefined routes
 */
const notFoundHandler = (req, res) => {
  return res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

// ==========================================
// Authentication Middleware
// ==========================================

/**
 * Authentication middleware
 * Verifies JWT from Authorization header
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Authentication token required",
      });
    }

    // Extract and verify token
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "api-monitor-secret-key"
    );

    // Set user to request object (in a real app, you would fetch the user from the database)
    req.user = {
      id: decoded.userId,
      username: decoded.username,
      role: decoded.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Request Logging Middleware
// ==========================================

/**
 * Request logger middleware
 * Logs all incoming requests
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log when request is received
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${
      req.originalUrl
    } - Request received`
  );

  // Capture response info on finish
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${
        res.statusCode
      } - ${duration}ms`
    );
  });

  next();
};

/**
 * CORS middleware for development
 */
const corsMiddleware = (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
    return res.status(200).json({});
  }

  next();
};

// ==========================================
// Export Middleware
// ==========================================
module.exports = {
  errorHandler,
  notFoundHandler,
  authenticate,
  requestLogger,
  corsMiddleware,
};
