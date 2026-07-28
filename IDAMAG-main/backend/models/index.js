const Office = require('./Office');
const Division = require('./Division');
const Report = require('./Report');
const User = require('./User');
const ActivityLog = require('./ActivityLog');
const sequelize = require('../config/database');

// Relationships

// Office -> Many Divisions
Office.hasMany(Division, { foreignKey: 'officeId', as: 'divisions' });
Division.belongsTo(Office, { foreignKey: 'officeId', as: 'office' });

// Division -> Many Reports
Division.hasMany(Report, { foreignKey: 'divisionId', as: 'reports' });
Report.belongsTo(Division, { foreignKey: 'divisionId', as: 'division' });

// Office -> Many Users
Office.hasMany(User, { foreignKey: 'officeId', as: 'users' });
User.belongsTo(Office, { foreignKey: 'officeId', as: 'office' });

// Division -> Many Users
Division.hasMany(User, { foreignKey: 'divisionId', as: 'users' });
User.belongsTo(Division, { foreignKey: 'divisionId', as: 'division' });

// User -> Many ActivityLogs
User.hasMany(ActivityLog, { foreignKey: 'userId', as: 'activityLogs' });
ActivityLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = {
  sequelize,
  Office,
  Division,
  Report,
  User,
  ActivityLog,
};
