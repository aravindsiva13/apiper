/**
 * Database configuration file
 * Sets up Sequelize connection to MySQL database
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

// Create Sequelize instance with database credentials
const sequelize = new Sequelize(
  process.env.DB_NAME || 'api_monitor',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      underscored: true, // Use snake_case for fields
      freezeTableName: false, // Use plural table names
      timestamps: true // Add createdAt and updatedAt columns
    }
  }
);

// Function to test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    return false;
  }
};

// Function to sync models with database (create tables)
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    console.log(`✅ Database ${force ? 'reset and ' : ''}synchronized successfully.`);
    return true;
  } catch (error) {
    console.error('❌ Error synchronizing database:', error);
    return false;
  }
};

module.exports = {
  sequelize,
  testConnection,
  syncDatabase
};