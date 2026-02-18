# Twitter Scraper

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)

A powerful Twitter/X scraper built with NestJS and Playwright. Extract tweets, user profiles, and search results programmatically through a REST API.

## 📋 Table of Contents

- [Features](#-features)
- [Requirements](#-requirements)
- [Quick Start](#-quick-start)
- [Environment Variables](#-environment-variables)
- [API Endpoints](#-api-endpoints)
- [Data Structures](#-data-structures)
- [Examples](#-examples)
- [Troubleshooting](#-troubleshooting)
- [Project Structure](#-project-structure)
- [Additional Documentation](#-additional-documentation)

## ✨ Features

- 🔐 **Automated Login** - Login to Twitter with credentials
- 📜 **Tweet Scraping** - Extract tweets from user timelines
- 🔍 **Search** - Search tweets by keywords with filters
- 👤 **User Profiles** - Get user profile information
- 💾 **Data Persistence** - Store scraped data in MongoDB
- 📊 **Statistics** - Get aggregated stats from stored data
- 🎭 **Stealth Mode** - Uses playwright-extra with stealth plugin
- 🍪 **Session Persistence** - Maintains login sessions between restarts

## 📦 Requirements

- **Node.js** >= 18.x
- **Yarn** >= 1.22.x (recommended) or npm
- **MongoDB** >= 6.x
- **Chromium** (installed via Playwright)

## 🚀 Quick Start

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd scraper
yarn install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see [Environment Variables](#-environment-variables) section).

### 3. Start MongoDB

```bash
# Option 1: Local MongoDB
mongod --dbpath /path/to/data

# Option 2: Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# Option 3: Docker with authentication
docker run -d -p 27017:27017 --name mongodb \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:latest
```

### 4. Install Playwright Browsers

```bash
npx playwright install chromium
```

### 5. Start the Application

```bash
# Development
yarn start:dev

# Production
yarn build
yarn start:prod
```

The API will be available at `http://localhost:3000`

## 🔧 Environment Variables

Create a `.env` file in the root directory with the following variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Environment (`development`, `production`, `test`) |
| `PORT` | No | `3000` | HTTP server port |
| **Twitter Credentials** |
| `TWITTER_USERNAME` | **Yes** | - | Your Twitter username |
| `TWITTER_PASSWORD` | **Yes** | - | Your Twitter password |
| `TWITTER_EMAIL` | No | - | Email for verification (if prompted) |
| **MongoDB** |
| `MONGODB_USERNAME` | **Yes** | - | MongoDB username |
| `MONGODB_PASSWORD` | **Yes** | - | MongoDB password |
| `MONGODB_HOST` | No | `localhost` | MongoDB host |
| `MONGODB_PORT` | No | `27017` | MongoDB port |
| `MONGODB_DB_NAME` | No | `twitter-scraper` | Database name |
| **Playwright** |
| `PLAYWRIGHT_HEADLESS` | No | `true` | Run browser in headless mode |
| `PLAYWRIGHT_TIMEOUT` | No | `30000` | Navigation timeout (ms) |
| `PLAYWRIGHT_SLOW_MO` | No | `100` | Slow down actions (ms) |
| **Scraping** |
| `SCRAPING_MAX_TWEETS_PER_REQUEST` | No | `100` | Max tweets per request |
| `SCRAPING_SCROLL_DELAY` | No | `2000` | Delay between scrolls (ms) |
| `SCRAPING_RETRY_ATTEMPTS` | No | `3` | Number of retry attempts |
| `SCRAPING_RATE_LIMIT_DELAY` | No | `60000` | Delay on rate limit (ms) |

### Example `.env` file

```env
# Application
NODE_ENV=development
PORT=3000

# Twitter Credentials
TWITTER_USERNAME=your_twitter_username
TWITTER_PASSWORD=your_twitter_password
TWITTER_EMAIL=your_email@example.com

# MongoDB
MONGODB_USERNAME=admin
MONGODB_PASSWORD=password
MONGODB_HOST=localhost
MONGODB_PORT=27017
MONGODB_DB_NAME=twitter-scraper

# Playwright Configuration
PLAYWRIGHT_HEADLESS=false
PLAYWRIGHT_TIMEOUT=30000
PLAYWRIGHT_SLOW_MO=100

# Scraping Configuration
SCRAPING_MAX_TWEETS_PER_REQUEST=100
SCRAPING_SCROLL_DELAY=2000
SCRAPING_RETRY_ATTEMPTS=3
SCRAPING_RATE_LIMIT_DELAY=60000
```

## 📡 API Endpoints

### Authentication

#### POST `/api/twitter/login`
Login to Twitter with credentials.

**Request Body:**
```json
{
  "username": "your_username",
  "password": "your_password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful"
}
```

### Tweet Scraping

#### GET `/api/twitter/tweets/username/:username`
Get tweets from a user's timeline.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | `50` | Number of tweets (1-500) |
| `includeReplies` | boolean | `false` | Include replies |
| `includeRetweets` | boolean | `true` | Include retweets |

**Response:**
```json
{
  "username": "elonmusk",
  "count": 20,
  "tweets": [
    {
      "tweetId": "1234567890",
      "text": "Tweet content...",
      "author": {
        "username": "elonmusk",
        "displayName": "Elon Musk",
        "verified": true
      },
      "createdAt": "2024-01-01T12:00:00.000Z",
      "metrics": {
        "likes": 1000,
        "retweets": 500,
        "replies": 100
      }
    }
  ]
}
```

#### POST `/api/twitter/tweets/search`
Search tweets by keyword.

**Request Body:**
```json
{
  "searchTerm": "artificial intelligence",
  "limit": 50,
  "filters": {
    "language": "en",
    "verified": true
  }
}
```

**Response:**
```json
{
  "searchTerm": "artificial intelligence",
  "count": 50,
  "tweets": [...]
}
```

#### GET `/api/twitter/tweets/:tweetId`
Get a specific tweet by ID.

**Response:**
```json
{
  "tweetId": "1234567890",
  "text": "Tweet content...",
  ...
}
```

### User Profiles

#### GET `/api/twitter/profile/:username`
Get user profile information.

**Response:**
```json
{
  "username": "elonmusk",
  "displayName": "Elon Musk",
  "bio": "CEO of Tesla and SpaceX",
  "followers": 150000000,
  "following": 500,
  "verified": true
}
```

### Stored Data

#### GET `/api/twitter/stored/tweets`
List tweets stored in the database.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Items per page |
| `username` | string | - | Filter by username |

**Response:**
```json
{
  "page": 1,
  "limit": 20,
  "count": 20,
  "tweets": [...]
}
```

#### GET `/api/twitter/stored/stats`
Get statistics from stored data.

**Response:**
```json
{
  "totalTweets": 1500,
  "uniqueUsers": 50,
  "tweetsByType": [
    { "_id": "original", "count": 1000 },
    { "_id": "retweet", "count": 300 },
    { "_id": "reply", "count": 200 }
  ],
  "topHashtags": [
    { "_id": "AI", "count": 150 },
    { "_id": "Tech", "count": 120 }
  ]
}
```

## 📊 Data Structures

### Tweet Schema

```typescript
interface Tweet {
  tweetId: string;           // Unique tweet ID
  text: string;              // Tweet content
  author: {
    username: string;        // @username
    displayName: string;     // Display name
    userId: string;          // User ID
    profileImageUrl: string; // Profile image URL
    verified: boolean;       // Verification status
  };
  createdAt: Date;           // Tweet creation date
  scrapedAt: Date;           // Scraping timestamp
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    views: number;
    bookmarks: number;
  };
  media: Array<{
    type: 'image' | 'video' | 'gif';
    url: string;
    thumbnailUrl: string;
  }>;
  hashtags: string[];        // Hashtags (without #)
  mentions: string[];        // Mentions (without @)
  urls: string[];            // URLs in tweet
  location: string;          // Location if available
  tweetType: 'original' | 'retweet' | 'reply' | 'quote';
  inReplyToTweetId: string;
  quotedTweetId: string;
  retweetedTweetId: string;
  language: string;
  isThread: boolean;
  threadPosition: number;
}
```

## 🧪 Examples

### cURL Examples

```bash
# Login
curl -X POST http://localhost:3000/api/twitter/login \
  -H "Content-Type: application/json" \
  -d '{"username": "your_user", "password": "your_pass"}'

# Get user tweets
curl "http://localhost:3000/api/twitter/tweets/username/elonmusk?limit=10"

# Search tweets
curl -X POST http://localhost:3000/api/twitter/tweets/search \
  -H "Content-Type: application/json" \
  -d '{"searchTerm": "AI", "limit": 20}'

# Get stored stats
curl "http://localhost:3000/api/twitter/stored/stats"
```

### JavaScript/Fetch Examples

```javascript
// Login
const loginResponse = await fetch('http://localhost:3000/api/twitter/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'user', password: 'pass' })
});

// Get tweets
const tweetsResponse = await fetch(
  'http://localhost:3000/api/twitter/tweets/username/elonmusk?limit=10'
);
const { tweets } = await tweetsResponse.json();
```

## 🐛 Troubleshooting

### Error: "Browser not initialized"
The browser initializes automatically on startup. Check application logs for errors.

### Error: "Login failed"
**Possible causes:**
- Invalid credentials
- Twitter suspicious activity detection
- 2FA verification required
- Selector changes

**Solutions:**
1. Verify credentials in `.env`
2. Set `PLAYWRIGHT_HEADLESS=false` to see the browser
3. Check screenshots in `./screenshots/`
4. Manually login and handle 2FA

### Error: "No tweets found"
**Possible causes:**
- Twitter selector changes
- Private account
- Rate limiting

**Solutions:**
1. Check selectors in [`twitter-selectors.constants.ts`](src/modules/twitter-scraper/constants/twitter-selectors.constants.ts:1)
2. Increase timeouts
3. Check screenshots for errors

### Error: "MongoDB connection failed"
```bash
# Verify MongoDB is running
mongosh

# Or with Docker
docker ps | grep mongo
```

## 📁 Project Structure

```
src/
├── modules/
│   └── twitter-scraper/
│       ├── controllers/
│       │   └── twitter-scraper.controller.ts
│       ├── services/
│       │   ├── twitter-scraper.service.ts
│       │   └── playwright-browser.service.ts
│       ├── repositories/
│       │   └── tweet.repository.ts
│       ├── schemas/
│       │   └── tweet.schema.ts
│       ├── dto/
│       │   ├── login.dto.ts
│       │   ├── get-tweets-by-username.dto.ts
│       │   └── search-tweets.dto.ts
│       └── constants/
│           └── twitter-selectors.constants.ts
├── common/
│   ├── config/
│   │   └── env.validation.ts
│   ├── database/
│   │   └── mongodb/
│   │       └── mongodb.module.ts
│   └── filters/
│       └── global-exception.filter.ts
└── app.module.ts
```

## 📚 Additional Documentation

- [Architecture Overview](plans/twitter-scraper-architecture.md)
- [Implementation Examples](plans/implementation-examples.md)
- [Best Practices](plans/best-practices-and-considerations.md)
- [Quick Start Guide](plans/quick-start-guide.md)

## ⚠️ Disclaimer

1. **Legal**: Web scraping may violate Twitter's Terms of Service. Use only for educational purposes.
2. **Rate Limiting**: Respect Twitter's rate limits to avoid account suspension.
3. **Credentials**: Never commit `.env` files with real credentials.
4. **Selectors**: Twitter's UI changes frequently. Keep selectors updated.
5. **Official API**: Consider using Twitter's official API for production use.

## 📄 License

This project is [UNLICENSED](LICENSE) - for educational purposes only.

---

**Note**: Set `PLAYWRIGHT_HEADLESS=false` for visual debugging during development.
