export const getOperatorToken = () => localStorage.getItem('op_token') || '';
export const getOperatorName  = () => localStorage.getItem('op_name') || '';
export const getOperatorCode  = () => localStorage.getItem('op_code') || '';
export const getOperatorBrand = () => {
  try {
    const raw = localStorage.getItem('op_brand');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};
export const getOperatorBrandName = () => getOperatorBrand().brandName || getOperatorName();
export const isOperatorLoggedIn = () => !!getOperatorToken();

export const setOperatorAuth = ({ token, operator }) => {
  localStorage.setItem('op_token', token);
  localStorage.setItem('op_name', operator.name);
  localStorage.setItem('op_code', operator.shortCode);
  localStorage.setItem('op_id', operator.id);
  localStorage.setItem('op_brand', JSON.stringify({
    brandName: operator.brandName,
    accentColor: operator.accentColor,
  }));
};

export const clearOperatorAuth = () => {
  ['op_token', 'op_name', 'op_code', 'op_id', 'op_brand'].forEach((k) =>
    localStorage.removeItem(k)
  );
};
