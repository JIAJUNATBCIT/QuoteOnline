const jwt = require('jsonwebtoken');

/**
 * 生成 access token
 * @param {Object} payload - token 载荷
 * @returns {string} access token
 */
function generateAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { 
    expiresIn: '30m' // 30分钟
  });
}

/**
 * 生成 refresh token
 * @param {Object} payload - token 载荷
 * @returns {string} refresh token
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { 
    expiresIn: '3d' // 3天
  });
}

/**
 * 验证 access token
 * @param {string} token - access token
 * @returns {Object} 解码后的载荷
 */
function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

/**
 * 验证 refresh token
 * @param {string} token - refresh token
 * @returns {Object} 解码后的载荷
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

/**
 * 从请求中获取 refresh token
 * @param {Object} req - Express 请求对象
 * @returns {string|null} refresh token
 */
function getRefreshTokenFromRequest(req) {
  // 优先从 httpOnly cookie 获取
  if (req.cookies && req.cookies.refreshToken) {
    return req.cookies.refreshToken;
  }
  
  // 备用：从请求头获取
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return null;
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  getRefreshTokenFromRequest
};