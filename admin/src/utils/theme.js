export const getTheme  = () => localStorage.getItem('admin_theme') || 'light';

export const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('admin_theme', theme);
};

export const initTheme = () => applyTheme(getTheme());

export const toggleTheme = () => {
  const next = getTheme() === 'light' ? 'dark' : 'light';
  applyTheme(next);
  return next;
};
