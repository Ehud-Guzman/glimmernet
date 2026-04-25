export const getToken  = () => localStorage.getItem('admin_token') || '';
export const getRole   = () => localStorage.getItem('admin_role')  || '';
export const getName   = () => localStorage.getItem('admin_name')  || '';
export const isSuperAdmin  = () => getRole() === 'superadmin';

export const clearAuth = () => {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_role');
  localStorage.removeItem('admin_name');
};

const isTokenExpired = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
};

export const isLoggedIn = () => {
  const token = getToken();
  if (!token) return false;
  if (isTokenExpired(token)) {
    clearAuth();
    return false;
  }
  return true;
};
