// API function for the dashboard (UI fig 47). The answer depends on the user's role;
// see docs/api/calendar-attendance-dashboard.md for the shape of each role's dashboard.
import { api } from './client.js';

export const getDashboard = () => api.get('/dashboard');
