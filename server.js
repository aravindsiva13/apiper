// /**
//  * API Performance Monitor - Server Entry Point
//  */

// require("dotenv").config();
// const app = require("./app");
// const {
//   sequelize,
//   testConnection,
//   syncDatabase,
// } = require("./config/database");
// const monitorService = require("./services/monitorService");
// const securityMonitorService = require("./services/securityMonitorService");

// // Set port
// const PORT = process.env.PORT || 3000;

// // Function to initialize default endpoints if none exist
// const initializeDefaultEndpoints = async () => {
//   try {
//     // Import models
//     const { Endpoint } = require("./models");

//     const count = await Endpoint.count();

//     if (count === 0) {
//       console.log("No endpoints found, creating default endpoints...");

//       const defaultEndpoints = [
//         {
//           path: "/api/users",
//           method: "GET",
//           description: "Get users API",
//           isActive: true,
//           responseTimeThreshold: 500,
//           errorRateThreshold: 1.0,
//           availabilityThreshold: 99.5,
//           baseUrl:
//             process.env.DEFAULT_API_BASE_URL ||
//             "https://jsonplaceholder.typicode.com",
//         },
//         {
//           path: "/api/posts",
//           method: "GET",
//           description: "Get posts API",
//           isActive: true,
//           responseTimeThreshold: 500,
//           errorRateThreshold: 1.0,
//           availabilityThreshold: 99.5,
//           baseUrl:
//             process.env.DEFAULT_API_BASE_URL ||
//             "https://jsonplaceholder.typicode.com",
//         },
//         {
//           path: "/api/comments",
//           method: "GET",
//           description: "Get comments API",
//           isActive: true,
//           responseTimeThreshold: 500,
//           errorRateThreshold: 1.0,
//           availabilityThreshold: 99.5,
//           baseUrl:
//             process.env.DEFAULT_API_BASE_URL ||
//             "https://jsonplaceholder.typicode.com",
//         },
//         {
//           path: "/api/todos",
//           method: "GET",
//           description: "Get todos API",
//           isActive: true,
//           responseTimeThreshold: 400,
//           errorRateThreshold: 1.0,
//           availabilityThreshold: 99.5,
//           baseUrl:
//             process.env.DEFAULT_API_BASE_URL ||
//             "https://jsonplaceholder.typicode.com",
//         },
//         {
//           path: "/api/albums",
//           method: "GET",
//           description: "Get albums API",
//           isActive: true,
//           responseTimeThreshold: 300,
//           errorRateThreshold: 1.0,
//           availabilityThreshold: 99.5,
//           baseUrl:
//             process.env.DEFAULT_API_BASE_URL ||
//             "https://jsonplaceholder.typicode.com",
//         },
//       ];

//       await Endpoint.bulkCreate(defaultEndpoints);
//       console.log("Default endpoints created successfully");
//     }
//   } catch (error) {
//     console.error("Error initializing default endpoints:", error);
//   }
// };

// // Function to initialize default admin user
// const initializeDefaultAdmin = async () => {
//   try {
//     const { User } = require("./models");
//     const bcrypt = require("bcryptjs");

//     // Check if admin exists
//     const adminExists = await User.findOne({
//       where: { username: "admin" },
//     });

//     if (!adminExists) {
//       console.log("Creating default admin user...");

//       // Hash password
//       const salt = await bcrypt.genSalt(10);
//       const hashedPassword = await bcrypt.hash(
//         process.env.ADMIN_PASSWORD || "admin123",
//         salt
//       );

//       // Create admin user
//       await User.create({
//         username: "admin",
//         email: process.env.ADMIN_EMAIL || "admin@example.com",
//         password: hashedPassword,
//         role: "ADMIN",
//         isActive: true,
//       });

//       console.log("Default admin user created successfully");
//     }
//   } catch (error) {
//     console.error("Error initializing default admin:", error);
//   }
// };

// // Start server
// const startServer = async () => {
//   try {
//     // Test database connection
//     const dbConnected = await testConnection();

//     if (!dbConnected) {
//       console.error("Exiting due to database connection failure");
//       process.exit(1);
//     }

//     // Sync database models
//     const force = process.env.DB_SYNC_FORCE === "true";
//     await syncDatabase(force);

//     // Initialize default data
//     await initializeDefaultEndpoints();
//     await initializeDefaultAdmin();

//     // Start monitoring service
//     try {
//       if (process.env.START_MONITORING !== "false") {
//         await monitorService.start();
//       }
//     } catch (monitorError) {
//       console.error("Failed to start monitoring service:", monitorError);
//       console.log("Server will continue without monitoring service.");
//     }

//     // Start the server
//     app.listen(PORT, () => {
//       console.log(`=== API Performance Monitor Server ===`);
//       console.log(`Server running on port ${PORT}`);
//       console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
//       console.log(`Database: ${process.env.DB_NAME || "api_monitor"}`);
//       console.log("=======================================");
//     });
//   } catch (error) {
//     console.error("Failed to start server:", error);
//     process.exit(1);
//   }
// };

// // Handle uncaught exceptions
// process.on("uncaughtException", (error) => {
//   console.error("Uncaught Exception:", error);
//   process.exit(1);
// });

// // Handle unhandled promise rejections
// process.on("unhandledRejection", (reason, promise) => {
//   console.error("Unhandled Rejection at:", promise, "reason:", reason);
// });

// // Start the server
// startServer();

// // Handle graceful shutdown
// const gracefulShutdown = () => {
//   console.log("Shutting down gracefully...");

//   // Stop monitoring service
//   try {
//     monitorService.stop();
//   } catch (error) {
//     console.error("Error stopping monitoring service:", error);
//   }

//   // Close database connection
//   sequelize
//     .close()
//     .then(() => {
//       console.log("Database connection closed");
//       process.exit(0);
//     })
//     .catch((err) => {
//       console.error("Error during database disconnection:", err);
//       process.exit(1);
//     });

//   // Force exit after 10 seconds
//   setTimeout(() => {
//     console.error("Forced shutdown after timeout");
//     process.exit(1);
//   }, 10000);
// };

// // Listen for termination signals
// process.on("SIGTERM", gracefulShutdown);
// process.on("SIGINT", gracefulShutdown);

//2
/**
 * API Performance Monitor - Server Entry Point
 */

require("dotenv").config();
const app = require("./app");
const {
  sequelize,
  testConnection,
  syncDatabase,
} = require("./config/database");
const monitorService = require("./services/monitorService");
const securityMonitorService = require("./services/securityMonitorService");

// Set port
const PORT = process.env.PORT || 3000;

// Function to initialize default endpoints if none exist
const initializeDefaultEndpoints = async () => {
  try {
    // Import models
    const { Endpoint } = require("./models");

    const count = await Endpoint.count();

    if (count === 0) {
      console.log("No endpoints found, creating default endpoints...");

      const defaultEndpoints = [
        {
          path: "/api/users",
          method: "GET",
          description: "Get users API",
          isActive: true,
          responseTimeThreshold: 500,
          errorRateThreshold: 1.0,
          availabilityThreshold: 99.5,
          baseUrl:
            process.env.DEFAULT_API_BASE_URL ||
            "https://jsonplaceholder.typicode.com",
        },
        {
          path: "/api/posts",
          method: "GET",
          description: "Get posts API",
          isActive: true,
          responseTimeThreshold: 500,
          errorRateThreshold: 1.0,
          availabilityThreshold: 99.5,
          baseUrl:
            process.env.DEFAULT_API_BASE_URL ||
            "https://jsonplaceholder.typicode.com",
        },
        {
          path: "/api/comments",
          method: "GET",
          description: "Get comments API",
          isActive: true,
          responseTimeThreshold: 500,
          errorRateThreshold: 1.0,
          availabilityThreshold: 99.5,
          baseUrl:
            process.env.DEFAULT_API_BASE_URL ||
            "https://jsonplaceholder.typicode.com",
        },
        {
          path: "/api/todos",
          method: "GET",
          description: "Get todos API",
          isActive: true,
          responseTimeThreshold: 400,
          errorRateThreshold: 1.0,
          availabilityThreshold: 99.5,
          baseUrl:
            process.env.DEFAULT_API_BASE_URL ||
            "https://jsonplaceholder.typicode.com",
        },
        {
          path: "/api/albums",
          method: "GET",
          description: "Get albums API",
          isActive: true,
          responseTimeThreshold: 300,
          errorRateThreshold: 1.0,
          availabilityThreshold: 99.5,
          baseUrl:
            process.env.DEFAULT_API_BASE_URL ||
            "https://jsonplaceholder.typicode.com",
        },
      ];

      await Endpoint.bulkCreate(defaultEndpoints);
      console.log("Default endpoints created successfully");
    }
  } catch (error) {
    console.error("Error initializing default endpoints:", error);
  }
};

// Function to initialize default admin user
const initializeDefaultAdmin = async () => {
  try {
    const { User } = require("./models");
    const bcrypt = require("bcryptjs");

    // Check if admin exists
    const adminExists = await User.findOne({
      where: { username: "admin" },
    });

    if (!adminExists) {
      console.log("Creating default admin user...");

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(
        process.env.ADMIN_PASSWORD || "admin123",
        salt
      );

      // Create admin user
      await User.create({
        username: "admin",
        email: process.env.ADMIN_EMAIL || "admin@example.com",
        password: hashedPassword,
        role: "ADMIN",
        isActive: true,
      });

      console.log("Default admin user created successfully");
    }
  } catch (error) {
    console.error("Error initializing default admin:", error);
  }
};

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error("Exiting due to database connection failure");
      process.exit(1);
    }

    // Sync database models
    const force = process.env.DB_SYNC_FORCE === "true";
    await syncDatabase(force);

    // Initialize default data
    await initializeDefaultEndpoints();
    await initializeDefaultAdmin();

    // Start monitoring service
    try {
      if (process.env.START_MONITORING !== "false") {
        await monitorService.start();
      }
    } catch (monitorError) {
      console.error("Failed to start monitoring service:", monitorError);
      console.log("Server will continue without monitoring service.");
    }

    // Start security monitoring service
    try {
      if (process.env.START_SECURITY_MONITORING !== "false") {
        await securityMonitorService.start();
        console.log("Security monitoring service started successfully");
      }
    } catch (securityMonitorError) {
      console.error(
        "Failed to start security monitoring service:",
        securityMonitorError
      );
      console.log("Server will continue without security monitoring service.");
    }

    // Start the server
    app.listen(PORT, () => {
      console.log(`=== API Performance Monitor Server ===`);
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`Database: ${process.env.DB_NAME || "api_monitor"}`);
      console.log("=======================================");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Start the server
startServer();

// Handle graceful shutdown
const gracefulShutdown = () => {
  console.log("Shutting down gracefully...");

  // Stop monitoring services
  try {
    monitorService.stop();
    securityMonitorService.stop();
    console.log("Monitoring services stopped");
  } catch (error) {
    console.error("Error stopping monitoring services:", error);
  }

  // Close database connection
  sequelize
    .close()
    .then(() => {
      console.log("Database connection closed");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error during database disconnection:", err);
      process.exit(1);
    });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
