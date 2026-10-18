const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
require('dotenv').config();
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
app.listen(PORT, () => console.log('Server running on port', PORT));