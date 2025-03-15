/**
 * Express application setup
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const routes = require("./routes");
const {
  errorHandler,
  notFoundHandler,
  requestLogger,
} = require("./middleware");

// Create Express app
const app = express();

// Set trust proxy if behind a proxy
app.set("trust proxy", 1);

// Security middleware
app.use(helmet());

// CORS middleware
app.use(
  cors({
    origin: "http://localhost:3001",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use(requestLogger);

// API root route
app.get("/", (req, res) => {
  res.json({
    message: "API Performance Monitor API",
    version: "1.0.0",
    status: "online",
  });
});

// API routes
app.use("/api", routes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

module.exports = app;
