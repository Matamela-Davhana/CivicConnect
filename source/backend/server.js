const express = require('express');
const cors = require('cors');

require('dotenv').config();
const PORT = process.env.PORT || 3000;
const app = express();
app.get('/api/health', (req,res) => res.json({status:'ok'}));
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/staff', require('./routes/staff'));

app.use('/api/admin', require('./routes/admin'));
app.use('/api/management', require('./routes/management'));

module.exports = app;
// Importing the app for tests must not start a second HTTP listener.
if (require.main === module) {
  app.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log('Server running on port', PORT));
}
