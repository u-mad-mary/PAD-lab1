const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

const client = require('prom-client');

const app = express();
const PORT = 3000;

app.use(express.json());

// Define service instances
const userServiceInstances = ['http://user-service:5002'];
const chatServiceInstances = ['http://chat-service:5001'];


const axiosInstance = axios.create({
  timeout: 5000
});

const cache = new NodeCache({ stdTTL: 30 }); // Set a 30-second cache expiration

const limiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100, // limit each IP to 10 requests per windowMs
});

// Load Balancer and Circuit Breaker State
let userServiceCounter = 0;
let chatServiceCounter = 0;
const circuitBreakerStates = {
    userService: { state: 'CLOSED', failureCount: 0, nextTry: 0 },  // normal state
    chatService: { state: 'CLOSED', failureCount: 0, nextTry: 0 }   // normal state
};
const FAILURE_THRESHOLD = 5;
const TIMEOUT = 30000; // 30 seconds


const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'code'],
  buckets: [0.1, 5, 15, 50, 100, 500]
});


app.use((req, res, next) => {
  res.locals.startEpoch = Date.now();
  next();
});


// Load Balancer function
function loadBalancer(serviceInstances, serviceName) {
    // Check Circuit Breaker state
    if (circuitBreakerStates[serviceName].state === 'OPEN') { // failures exceed FAILURE_THRESHOLD
        if (Date.now() > circuitBreakerStates[serviceName].nextTry) {
            circuitBreakerStates[serviceName].state = 'HALF-OPEN';
        } else {
            return null;
        }
    }

    // Round Robin selection
    let counter = serviceName === 'userService' ? userServiceCounter : chatServiceCounter;
    const instanceUrl = serviceInstances[counter % serviceInstances.length];
    serviceName === 'userService' ? userServiceCounter++ : chatServiceCounter++;
    return instanceUrl;
}

// Forward request to the service and handle Circuit Breaker logic
async function forwardRequest(serviceUrl, req, res, serviceName, cacheKey, requestBody) {
  try {
    let response;
    if (req.method === 'GET') {
      response = await axiosInstance.get(serviceUrl);
    } else if (req.method === 'POST') {
      response = await axiosInstance.post(serviceUrl, requestBody);
    } else if (req.method === 'PUT') {
      response = await axiosInstance.put(serviceUrl, requestBody);
    } else if (req.method === 'DELETE') {
      response = await axiosInstance.delete(serviceUrl);
    }

    // Cache logic, if applicable
    if (cacheKey) {
      cache.set(cacheKey, response.data);
    }

    res.json(response.data);
    // Reset failure count if Circuit Breaker is HALF-OPEN
    if (circuitBreakerStates[serviceName].state === 'HALF-OPEN') { // After TIMEOUT, the state changes to HALF-OPEN, allowing a few test requests to check if the issue is resolved.
      circuitBreakerStates[serviceName] = { state: 'CLOSED', failureCount: 0, nextTry: 0 };
    }
  } catch (error) {
    // Increase failure count
    circuitBreakerStates[serviceName].failureCount++;
    if (circuitBreakerStates[serviceName].failureCount > FAILURE_THRESHOLD) {
      circuitBreakerStates[serviceName] = { state: 'OPEN', failureCount: 0, nextTry: Date.now() + TIMEOUT }; 
    }
    handleErrorResponse(error, res);
  }
}

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

app.get('/api/chat', limiter, async (req, res) => {
  const cacheKey = 'chatData';
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return res.json(cachedData);
  }

  const url = loadBalancer(chatServiceInstances, 'chatService');
  if (url) forwardRequest(`${url}/chat`, req, res, 'chatService', cacheKey);
  else res.status(503).send('Service Temporarily Unavailable');
});


app.get('/api/chat/:id', limiter, async (req, res) => {
  const chatId = req.params.id;
  const cacheKey = `chatData_${chatId}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
      return res.json(cachedData);
  }

  const url = loadBalancer(chatServiceInstances, 'chatService');
  if (url) forwardRequest(`${url}/chat/${chatId}`, req, res, 'chatService', cacheKey);
  else res.status(503).send('Service Temporarily Unavailable');
});

app.post('/api/chat', limiter, async (req, res) => {
  const url = loadBalancer(chatServiceInstances, 'chatService');
  if (url) forwardRequest(`${url}/chat`, req, res, 'chatService', null, req.body);
  else res.status(503).send('Service Temporarily Unavailable');
});

app.put('/api/chat/:id', limiter, async (req, res) => {
  const chatId = req.params.id;
  const url = loadBalancer(chatServiceInstances, 'chatService');
  if (url) forwardRequest(`${url}/chat/${chatId}`, req, res, 'chatService', null, req.body);
  else res.status(503).send('Service Temporarily Unavailable');
});

app.delete('/api/chat/:id', limiter, async (req, res) => {
  const chatId = req.params.id;
  const url = loadBalancer(chatServiceInstances, 'chatService');
  if (url) forwardRequest(`${url}/chat/${chatId}`, req, res, 'chatService');
  else res.status(503).send('Service Temporarily Unavailable');
});

app.post('/api/chat/:id/message', limiter, async (req, res) => {
  const chatId = req.params.id;
  const url = loadBalancer(chatServiceInstances, 'chatService');
  if (url) forwardRequest(`${url}/chat/${chatId}/message`, req, res, 'chatService', null, req.body);
  else res.status(503).send('Service Temporarily Unavailable');
});


app.get('/api/user', limiter, async (req, res) => {
  const cachedData = cache.get('userData');
  if (cachedData) {
      return res.json(cachedData);
  }

  const url = loadBalancer(userServiceInstances, 'userService');
  if (url) {
      forwardRequest(`${url}/user`, req, res, 'userService').then(responseData => {
          if (responseData) cache.set('userData', responseData);
      });
  } else {
      res.status(503).send('Service Temporarily Unavailable');
  }
});


app.get('/api/user/:id', limiter, async (req, res) => {
  const userId = req.params.id;
  const cacheKey = `userData_${userId}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return res.json(cachedData);
  }

  const url = loadBalancer(userServiceInstances, 'userService');
  if (url) forwardRequest(`${url}/user/${userId}`, req, res, 'userService', cacheKey);
  else res.status(503).send('Service Temporarily Unavailable');
});


app.post('/api/user', limiter, async (req, res) => {
  const url = loadBalancer(userServiceInstances, 'userService');
  if (url) forwardRequest(`${url}/user`, req, res, 'userService', null, req.body);
  else res.status(503).send('Service Temporarily Unavailable');
});

app.put('/api/user/:id', limiter, async (req, res) => {
  const userId = req.params.id;
  const url = loadBalancer(userServiceInstances, 'userService');
  if (url) forwardRequest(`${url}/user/${userId}`, req, res, 'userService', null, req.body);
  else res.status(503).send('Service Temporarily Unavailable');
});

app.delete('/api/user/:id', limiter, async (req, res) => {
  const userId = req.params.id;
  const url = loadBalancer(userServiceInstances, 'userService');
  if (url) forwardRequest(`${url}/user/${userId}`, req, res, 'userService');
  else res.status(503).send('Service Temporarily Unavailable');
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

// After your routes
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// Update your existing routes to record the metrics
app.use((req, res, next) => {
  const responseTimeInMs = Date.now() - res.locals.startEpoch;
  httpRequestDurationMicroseconds.labels(req.method, req.route.path, res.statusCode).observe(responseTimeInMs);
  next();
});

app.listen(PORT, () => {
  console.log(`API Gateway running at http://localhost:${PORT}`);
});
