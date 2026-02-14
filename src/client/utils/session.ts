/**
 * Session ID management for tracking user sessions
 * Used for feedback collection and analytics
 */

const SESSION_ID_KEY = 'beleidsscan_session_id';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface SessionData {
  id: string;
  createdAt: number;
}

/**
 * Get or create a session ID
 * Session IDs persist for 24 hours, then a new one is created
 */
export function getSessionId(): string {
  try {
    const stored = localStorage.getItem(SESSION_ID_KEY);
    if (stored) {
      const sessionData: SessionData = JSON.parse(stored);
      const now = Date.now();
      
      // Check if session is still valid (within 24 hours)
      if (sessionData.id && now - sessionData.createdAt < SESSION_DURATION) {
        return sessionData.id;
      }
    }
    
    // Create new session ID
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const sessionData: SessionData = {
      id: newSessionId,
      createdAt: Date.now()
    };
    
    localStorage.setItem(SESSION_ID_KEY, JSON.stringify(sessionData));
    return newSessionId;
  } catch (error) {
    // Fallback if localStorage fails
    console.warn('Failed to get/create session ID:', error);
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Get the current user ID from auth token or return undefined
 */
export function getUserId(): string | undefined {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) return undefined;
    
    // Extract user ID from JWT token (basic parsing)
    // Note: This is a simple implementation. For production, use a proper JWT library
    try {
      const parts = token.split('.');
      if (parts.length < 3) {
        return undefined; // Invalid JWT format
      }
      const payload = JSON.parse(atob(parts[1]));
      return payload.id || payload.userId || payload.sub;
    } catch {
      return undefined;
    }
  } catch {
    return undefined;
  }
}

