const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const chatbotRoutes = require("./chatbot/chatbotRoutes");
const { sequelize, Office, Division, Report, User, ActivityLog } = require('./models/index');
const { sendWelcomeEmail, generateSecurePassword } = require('./utils/emailService');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api/chatbot", chatbotRoutes);

// --- LOGGING HELPER ---
const logActivity = async (userId, action, description, metadata = null, req = null) => {
  try {
    let effectiveUserId = userId;
    let ipAddress = null;

    if (req) {
      ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
      
      // Auto-extract user ID from custom header if not explicitly provided
      if (!effectiveUserId && req.headers['x-user-id']) {
        const headerId = parseInt(req.headers['x-user-id']);
        if (!isNaN(headerId)) effectiveUserId = headerId;
      }
    }
    
    await ActivityLog.create({ 
      userId: effectiveUserId, 
      action, 
      description, 
      metadata, 
      ipAddress 
    });
  } catch (error) {
    console.error('Logging Error:', error);
  }
};

// --- ROUTES ---

// Auth
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ 
      where: { email },
      include: ['office', 'division']
    });

    if (!user) {
      await logActivity(null, 'LOGIN_ATTEMPT', `Failed login attempt for email: ${email}`, { email }, req);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Support both existing plaintext and new bcrypt hashes for smooth transition
    let isMatch = false;
    if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = (user.password === password);
    }

    if (!isMatch) {
      await logActivity(user.id, 'LOGIN_FAIL', `Incorrect password for ${user.email}`, null, req);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Account Activation Logic
    if (!user.isActive) {
      if (user.requiresPasswordChange) {
        // Admin-created user logging in for the first time
        await user.update({ isActive: true });
        await logActivity(user.id, 'ACTIVATE_USER', `Account activated on first login: ${user.email}`, null, req);
      } else {
        // Self-registered user or deactivated account
        await logActivity(user.id, 'LOGIN_BLOCKED', `Login blocked for inactive account: ${user.email}`, null, req);
        return res.status(403).json({ 
          message: 'Account Pending Activation. Your registration is still awaiting approval from an administrator.' 
        });
      }
    }

    await logActivity(user.id, 'LOGIN_SUCCESS', `User logged in: ${user.email}`, null, req);

    const userResponse = user.toJSON();
    delete userResponse.password;

    res.json(userResponse);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test Connection
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is connected to MySQL and running!' });
});

// Offices
app.get('/api/offices', async (req, res) => {
  try {
    const offices = await Office.findAll({ include: 'divisions' });
    res.json(offices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/offices', async (req, res) => {
  try {
    const office = await Office.create(req.body);
    await logActivity(null, 'ADD_OFFICE', `New office created: ${office.name}`, { officeId: office.id }, req);
    res.status(201).json(office);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/offices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await Office.update(req.body, { where: { id } });
    if (updated) {
      const updatedOffice = await Office.findByPk(id);
      await logActivity(null, 'EDIT_OFFICE', `Office updated: ${updatedOffice.name}`, { officeId: id }, req);
      return res.status(200).json(updatedOffice);
    }
    throw new Error('Office not found');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/offices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const office = await Office.findByPk(id);
    const deleted = await Office.destroy({ where: { id } });
    if (deleted) {
      await logActivity(null, 'DELETE_OFFICE', `Office removed: ${office?.name || id}`, { deletedId: id }, req);
      return res.status(204).send("Office deleted");
    }
    throw new Error('Office not found');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Divisions
app.get('/api/divisions', async (req, res) => {
  try {
    const { officeId } = req.query;
    const filter = officeId ? { where: { officeId } } : {};
    const divisions = await Division.findAll(filter);
    res.json(divisions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/divisions', async (req, res) => {
  try {
    const division = await Division.create(req.body);
    await logActivity(null, 'ADD_SECTION', `New section created: ${division.name}`, { sectionId: division.id }, req);
    res.status(201).json(division);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/divisions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await Division.update(req.body, { where: { id } });
    if (updated) {
      const updatedDivision = await Division.findByPk(id);
      await logActivity(null, 'EDIT_SECTION', `Section updated: ${updatedDivision.name}`, { sectionId: id }, req);
      return res.status(200).json(updatedDivision);
    }
    throw new Error('Division not found');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/divisions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const division = await Division.findByPk(id);
    const deleted = await Division.destroy({ where: { id } });
    if (deleted) {
      await logActivity(null, 'DELETE_SECTION', `Section removed: ${division?.name || id}`, { deletedId: id }, req);
      return res.status(204).send("Division deleted");
    }
    throw new Error('Division not found');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reports
app.get('/api/reports', async (req, res) => {
  try {
    const { divisionId, officeId } = req.query;
    let include = [{ model: Division, as: 'division', include: [{ model: Office, as: 'office' }] }];
    
    let where = {};
    if (divisionId) where.divisionId = divisionId;
    if (officeId) {
        // Filtering by office requires joining through division
        include[0].where = { officeId };
    }

    const reports = await Report.findAll({ where, include });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reports', async (req, res) => {
  try {
    const { title, reportId, description, divisionId } = req.body;
    const report = await Report.create({ title, reportId, description, divisionId });
    await logActivity(null, 'ADD_REPORT', `New report added: ${title}`, { reportId: report.id }, req);
    res.status(201).json(report);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [updated] = await Report.update(req.body, { where: { id } });
    if (updated) {
      const updatedReport = await Report.findByPk(id);
      await logActivity(null, 'EDIT_REPORT', `Report updated: ${updatedReport.title}`, { reportId: id }, req);
      return res.status(200).json(updatedReport);
    }
    throw new Error('Report not found');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const report = await Report.findByPk(id);
    const deleted = await Report.destroy({ where: { id } });
    if (deleted) {
      await logActivity(null, 'DELETE_REPORT', `Report removed: ${report?.title || id}`, { deletedId: id }, req);
      return res.status(204).send("Report deleted");
    }
    throw new Error('Report not found');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Users
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.findAll({ include: ['office', 'division'] });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { officeId, divisionId } = req.body;

    // Strict Integrity Check: Division must belong to the Office
    const division = await Division.findByPk(divisionId);
    if (!division || division.officeId !== parseInt(officeId)) {
      return res.status(400).json({ 
        message: 'Invalid data integrity: The selected division does not belong to the selected office.' 
      });
    }

    // Generate password and require change on next login if admin created
    let plainPassword = req.body.password;
    let isAdminCreated = false;
    
    if (!plainPassword) {
      plainPassword = generateSecurePassword();
      req.body.requiresPasswordChange = true;
      isAdminCreated = true;
    }

    // Hash the password before saving
    const salt = await bcrypt.genSalt(10);
    req.body.password = await bcrypt.hash(plainPassword, salt);

    const user = await User.create(req.body);

    if (isAdminCreated) {
        await logActivity(null, 'ADD_USER', `Admin added new user: ${user.email}`, { userId: user.id }, req);
        // Run asynchronously without blocking the response
        sendWelcomeEmail(user.email, plainPassword);
    } else {
        await logActivity(user.id, 'REGISTRATION', `New user self-registered: ${user.email}`, null, req);
    }

    // Don't leak the hashed password in response
    const userResponse = user.toJSON();
    delete userResponse.password;
    
    res.status(201).json(userResponse);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { officeId, divisionId } = req.body;

    // Integrity Check if changing office/division
    if (officeId && divisionId) {
      const division = await Division.findByPk(divisionId);
      if (!division || division.officeId !== parseInt(officeId)) {
        return res.status(400).json({ 
          message: 'Invalid data integrity: The selected division does not belong to the selected office.' 
        });
      }
    }

    // Hash new password if it's being updated
    if (req.body.password) {
      // Check if it's not already a hash (just in case)
      if (!req.body.password.startsWith('$2a$') && !req.body.password.startsWith('$2b$')) {
        const salt = await bcrypt.genSalt(10);
        req.body.password = await bcrypt.hash(req.body.password, salt);
      }
    }

    const [updated] = await User.update(req.body, { where: { id } });
    if (updated) {
      const updatedUser = await User.findByPk(id, { include: ['office', 'division'] });
      await logActivity(null, 'EDIT_USER', `User details updated for: ${updatedUser.email}`, { userId: id }, req);
      // Don't leak the hashed password in response
      const userResponse = updatedUser.toJSON();
      delete userResponse.password;

      return res.status(200).json(userResponse);
    }
    throw new Error('User not found');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    const deleted = await User.destroy({ where: { id } });
    if (deleted) {
      await logActivity(null, 'REMOVE_USER', `User removed: ${user?.email || id}`, { deletedId: id }, req);
      return res.status(204).send("User deleted");
    }
    throw new Error('User not found');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const [updated] = await User.update({ isActive }, { where: { id } });
    if (updated) {
      const updatedUser = await User.findByPk(id, { include: ['office', 'division'] });
      await logActivity(null, isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', `${isActive ? 'Activated' : 'Deactivated'} user: ${updatedUser.email}`, { targetId: id }, req);
      const userResponse = updatedUser.toJSON();
      delete userResponse.password;
      return res.status(200).json(userResponse);
    }
    throw new Error('User not found');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    let isMatch = false;
    if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
      isMatch = await bcrypt.compare(currentPassword, user.password);
    } else {
      isMatch = (user.password === currentPassword);
    }

    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect current password' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await User.update({ password: hashedPassword, requiresPasswordChange: false }, { where: { id } });
    await logActivity(id, 'CHANGE_PASSWORD', `User changed password: ${user.email}`, null, req);
    
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SERVER INITIALIZATION ---

app.get('/', (req, res) => {
  res.send('DA-RFO I Office Report Management System API is running...');
});

app.post('/api/logout', async (req, res) => {
  const { userId, email } = req.body;
  await logActivity(userId, 'LOGOUT', `User logged out: ${email}`, null, req);
  res.status(200).json({ message: 'Logout logged' });
});

app.get('/api/activity-logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { count, rows } = await ActivityLog.findAndCountAll({
      include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: limit,
      offset: offset
    });

    res.json({
      logs: rows,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalCount: count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully.');
    
    // Sync models
    await sequelize.sync();
    console.log('Models synchronized.');

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};



startServer();
