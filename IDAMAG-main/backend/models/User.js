const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: true, // true for now to allow painless migration
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  suffix: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  requiresPasswordChange: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  role: {
    type: DataTypes.ENUM('Admin', 'Staff'),
    defaultValue: 'Staff',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  officeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Offices',
      key: 'id',
    },
  },
  divisionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Divisions',
      key: 'id',
    },
  },
}, {
  timestamps: true,
});

module.exports = User;
