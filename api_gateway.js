const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

const app = express();
const PORT = 3000;

app.use(express.json());

const chatServiceURL = 'http://chat-service:5001';
const userServiceURL = 'http://user-service:5002';

const axiosInstance = axios.create({
  timeout: 5000
});

const cache = new NodeCache({ stdTTL: 30 }); // Set a 30-second cache expiration


const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
});

// Error handling function
function handleErrorResponse(error, res) {
  if (error.response) {
    res.status(error.response.status).json(error.response.data);
  } else if (error.code === 'ECONNABORTED') {
    res.status(408).json({ error: 'Request Timeout' });
  } else {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Routes for Chat Service
app.get('/api/chat', limiter, async (req, res) => {
  const cachedData = cache.get('chatData');
  if (cachedData) {
    return res.json(cachedData);
  }

  try {
    const response = await axiosInstance.get(`${chatServiceURL}/chat`);
    const responseData = response.data;
    cache.set('chatData', responseData);
    res.json(responseData);
  } catch (error) {
    handleErrorResponse(error, res);
  }
});

app.post('/api/chat', limiter, async (req, res) => {
  try {
    const response = await axiosInstance.post(`${chatServiceURL}/chat`, req.body, {
      headers: { 'Content-Type': 'application/json' },
    });
    // Clear the cache on new data
    cache.del('chatData');
    res.json(response.data);
  } catch (error) {
    handleErrorResponse(error, res);
  }
});

app.put('/api/chat/:id', limiter, async (req, res) => {
  const chatId = req.params.id;
  try {
    const response = await axiosInstance.put(`${chatServiceURL}/chat/${chatId}`, req.body, {
      headers: { 'Content-Type': 'application/json' },
    });
    // Clear the cache on update
    cache.del('chatData');
    res.json(response.data);
  } catch (error) {
    handleErrorResponse(error, res);
  }
});

app.delete('/api/chat/:id', limiter, async (req, res) => {
  const chatId = req.params.id;
  try {
    const response = await axiosInstance.delete(`${chatServiceURL}/chat/${chatId}`);
    // Clear the cache on deletion
    cache.del('chatData');
    res.json(response.data);
  } catch (error) {
    handleErrorResponse(error, res);
  }
});

// Routes for User Service
app.get('/api/user', limiter, async (req, res) => {
  const cachedData = cache.get('userData');
  if (cachedData) {
    return res.json(cachedData);
  }

  try {
    const response = await axiosInstance.get(`${userServiceURL}/user`);
    const responseData = response.data;
    cache.set('userData', responseData);
    res.json(responseData);
  } catch (error) {
    handleErrorResponse(error, res);
  }
});

app.post('/api/user', limiter, async (req, res) => {
  try {
    const response = await axiosInstance.post(`${userServiceURL}/user`, req.body, {
      headers: { 'Content-Type': 'application/json' },
    });
    // Clear the cache on new data
    cache.del('userData');
    res.json(response.data);
  } catch (error) {
    handleErrorResponse(error, res);
  }
});

app.put('/api/user/:id', limiter, async (req, res) => {
  const userId = req.params.id;
  try {
    const response = await axiosInstance.put(`${userServiceURL}/user/${userId}`, req.body, {
      headers: { 'Content-Type': 'application/json' },
    });
    // Clear the cache on update
    cache.del('userData');
    res.json(response.data);
  } catch (error) {
    handleErrorResponse(error, res);
  }
});

app.delete('/api/user/:id', limiter, async (req, res) => {
  const userId = req.params.id;
  try {
    const response = await axiosInstance.delete(`${userServiceURL}/user/${userId}`);
    // Clear the cache on deletion
    cache.del('userData');
    res.json(response.data);
  } catch (error) {
    handleErrorResponse(error, res);
  }
});

// Route to view cache content
app.get('/api/cache', (req, res) => {
  const cacheContent = cache.keys();
  const cachedData = {};

  cacheContent.forEach((key) => {
    const value = cache.get(key);
    cachedData[key] = value;
  });

  res.json(cachedData);
});


app.listen(PORT, () => {
  console.log(`API Gateway running at http://localhost:${PORT}`);
});
